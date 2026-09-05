package server

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "os"
    "path/filepath"
    "sort"
    "strings"
    "time"
    "text/template"
    "unicode"

    "github.com/google/uuid"
)

const composeTemplate = `services:
  mc:
    image: itzg/minecraft-server
    container_name: {{ .ContainerName }}
    environment:
      EULA: "true"
      ENABLE_WHITELIST: "true"
      ENFORCE_WHITELIST: "true"
      EXISTING_WHITELIST_FILE: "SKIP"
      VERSION: "{{ .Version }}"
    ports:
      - "{{ .Port }}:25565"
    volumes:
      - ./data:/data
    stdin_open: true
    tty: true
    restart: unless-stopped
`

type Manager struct {
    baseDir string
    tmpl    *template.Template
}

type composeData struct {
    Port          int
    ContainerName string
    Version       string
}

// defaultVersion is used when the caller leaves the version blank.
const defaultVersion = "1.21.11"

// maxVersionLen is a sanity bound; real itzg VERSION values are far shorter.
const maxVersionLen = 32

// validateVersion checks a user-supplied itzg/minecraft-server VERSION value.
//
// The result is written into a double-quoted YAML scalar in the generated
// compose file, so anything outside [A-Za-z0-9._-] is rejected rather than
// escaped: that keeps quotes and newlines from breaking out of the scalar and
// keeps '$' from being picked up by Compose's variable interpolation. Every
// real value fits the allowlist -- "1.21.11", "LATEST", "SNAPSHOT", "23w13a",
// "b1.7.3".
func validateVersion(input string) (string, error) {
    version := strings.TrimSpace(input)
    if version == "" {
        return defaultVersion, nil
    }
    if len(version) > maxVersionLen {
        return "", fmt.Errorf("version must be at most %d characters", maxVersionLen)
    }
    for _, r := range version {
        switch {
        case r >= 'a' && r <= 'z':
        case r >= 'A' && r <= 'Z':
        case r >= '0' && r <= '9':
        case r == '.' || r == '_' || r == '-':
        default:
            return "", fmt.Errorf("invalid character %q in version: use letters, digits, dots, dashes and underscores, e.g. \"1.21.11\" or \"LATEST\"", r)
        }
    }
    return version, nil
}

func NewManager(baseDir string) (*Manager, error) {
    if err := os.MkdirAll(baseDir, 0o755); err != nil {
        return nil, err
    }
    tmpl, err := template.New("compose").Parse(composeTemplate)
    if err != nil {
        return nil, err
    }
    return &Manager{baseDir: baseDir, tmpl: tmpl}, nil
}

func (m *Manager) List(ctx context.Context) ([]Server, error) {
    entries, err := os.ReadDir(m.baseDir)
    if err != nil {
        return []Server{}, nil
    }
    var result []Server
    for _, entry := range entries {
        if !entry.IsDir() {
            continue
        }
        server, err := m.loadServer(entry.Name())
        if err != nil {
            continue
        }
        status, _ := ComposeStatus(ctx, ComposeFilePath(server.ComposeDir))
        server.Status = status
        result = append(result, server)
    }
    sort.Slice(result, func(i, j int) bool {
        return result[i].CreatedAt.Before(result[j].CreatedAt)
    })
    if result == nil {
        result = []Server{}
    }
    return result, nil
}

func (m *Manager) Get(ctx context.Context, id string) (Server, error) {
    server, err := m.loadServer(id)
    if err != nil {
        return Server{}, err
    }
    status, _ := ComposeStatus(ctx, ComposeFilePath(server.ComposeDir))
    server.Status = status
    return server, nil
}

// validateServerFields applies the checks shared by Create and Update. It
// returns the sanitized name and the normalized version.
func validateServerFields(name string, port int, version string) (string, string, error) {
    if port < 1024 || port > 65535 {
        return "", "", fmt.Errorf("port must be between 1024 and 65535")
    }
    if strings.TrimSpace(name) == "" {
        return "", "", fmt.Errorf("name is required")
    }
    normalized, err := validateVersion(version)
    if err != nil {
        return "", "", err
    }
    return sanitizeName(name), normalized, nil
}

// writeComposeFile renders the compose template into composeDir, replacing any
// file already there. The container name is derived from the id, so it stays
// stable when a server is edited.
func (m *Manager) writeComposeFile(composeDir, id string, port int, version string) (string, error) {
    composePath := ComposeFilePath(composeDir)
    f, err := os.Create(composePath)
    if err != nil {
        return "", err
    }
    defer f.Close()
    data := composeData{Port: port, ContainerName: ContainerName(id), Version: version}
    if err := m.tmpl.Execute(f, data); err != nil {
        return "", err
    }
    return composePath, nil
}

func (m *Manager) Create(ctx context.Context, req CreateRequest) (Server, error) {
    log.Printf("[manager] creating server: name=%s, port=%d, version=%s", req.Name, req.Port, req.Version)
    name, version, err := validateServerFields(req.Name, req.Port, req.Version)
    if err != nil {
        return Server{}, err
    }
    conflict, conflictServer, err := m.runningServerOnPort(ctx, req.Port, "")
    if err != nil {
        return Server{}, err
    }
    id := uuid.NewString()
    log.Printf("[manager] assigned server id: %s", id)
    composeDir := filepath.Join(m.baseDir, id)
    if err := os.MkdirAll(filepath.Join(composeDir, "data"), 0o755); err != nil {
        return Server{}, err
    }
    composePath, err := m.writeComposeFile(composeDir, id, req.Port, version)
    if err != nil {
        return Server{}, err
    }
    log.Printf("[manager] generated compose file at %s", composePath)
    status := "starting"
    if conflict {
        status = "stopped"
        log.Printf("[manager] port %d already in use by running server %s; creating server %s without starting", req.Port, conflictServer, id)
    }
    server := Server{
        ID:         id,
        Name:       name,
        Port:       req.Port,
        Version:    version,
        Status:     status,
        CreatedAt:  time.Now().UTC(),
        ComposeDir: composeDir,
    }
    if err := m.saveServer(server); err != nil {
        return Server{}, err
    }
    if conflict {
        return server, nil
    }
    log.Printf("[manager] launching docker compose for server %s", id)
    if err := RunComposeUp(ctx, composePath); err != nil {
        log.Printf("[manager] failed to start server %s: %v", id, err)
        return Server{}, err
    }
    server.Status = "running"
    log.Printf("[manager] server %s is now running", id)
    return server, nil
}

// Update rewrites a server's name, port and version. The compose file is
// regenerated immediately, but a container that is already running keeps its
// current settings until it is recreated, so callers should tell the user to
// restart the server.
func (m *Manager) Update(ctx context.Context, id string, req UpdateRequest) (Server, error) {
    log.Printf("[manager] updating server %s: name=%s, port=%d, version=%s", id, req.Name, req.Port, req.Version)
    existing, err := m.loadServer(id)
    if err != nil {
        log.Printf("[manager] failed to load server %s: %v", id, err)
        return Server{}, err
    }
    name, version, err := validateServerFields(req.Name, req.Port, req.Version)
    if err != nil {
        return Server{}, err
    }
    conflict, conflictServer, err := m.runningServerOnPort(ctx, req.Port, id)
    if err != nil {
        return Server{}, err
    }
    if conflict {
        return Server{}, fmt.Errorf("port %d is already in use by running server %s", req.Port, conflictServer)
    }
    composePath, err := m.writeComposeFile(existing.ComposeDir, id, req.Port, version)
    if err != nil {
        return Server{}, err
    }
    log.Printf("[manager] regenerated compose file at %s", composePath)
    existing.Name = name
    existing.Port = req.Port
    existing.Version = version
    if err := m.saveServer(existing); err != nil {
        return Server{}, err
    }
    status, _ := ComposeStatus(ctx, composePath)
    existing.Status = status
    return existing, nil
}

func (m *Manager) Delete(ctx context.Context, id string) error {
    log.Printf("[manager] deleting server %s", id)
    server, err := m.loadServer(id)
    if err != nil {
        log.Printf("[manager] failed to load server %s: %v", id, err)
        return err
    }
    composePath := ComposeFilePath(server.ComposeDir)
    log.Printf("[manager] stopping docker compose for server %s", id)
    _ = RunComposeDown(ctx, composePath)
    log.Printf("[manager] removing server directory for %s", id)
    return os.RemoveAll(server.ComposeDir)
}

func (m *Manager) Start(ctx context.Context, id string) error {
    server, err := m.loadServer(id)
    if err != nil {
        return err
    }
    conflict, conflictServerID, err := m.runningServerOnPort(ctx, server.Port, id)
    if err != nil {
        return err
    }
    if conflict {
        return fmt.Errorf("cannot start server %s: port %d is already in use by running server %s", id, server.Port, conflictServerID)
    }
    composePath := ComposeFilePath(server.ComposeDir)
    log.Printf("[manager] starting server %s", id)
    if err := RunComposeUp(ctx, composePath); err != nil {
        return err
    }
    return nil
}

func (m *Manager) Stop(ctx context.Context, id string) error {
    server, err := m.loadServer(id)
    if err != nil {
        return err
    }
    composePath := ComposeFilePath(server.ComposeDir)
    log.Printf("[manager] stopping server %s", id)
    if err := RunComposeStop(ctx, composePath); err != nil {
        return err
    }
    return nil
}

func (m *Manager) ExecCommand(ctx context.Context, id, command string) (string, error) {
    if _, err := m.loadServer(id); err != nil {
        return "", err
    }
    containerName := ContainerName(id)
    output, err := RunDockerExec(ctx, containerName, command)
    if err != nil {
        return "", err
    }
    return output, nil
}

func (m *Manager) loadServer(id string) (Server, error) {
    metaPath := filepath.Join(m.baseDir, id, "server.json")
    data, err := os.ReadFile(metaPath)
    if err != nil {
        return Server{}, err
    }
    var server Server
    if err := json.Unmarshal(data, &server); err != nil {
        return Server{}, err
    }
    return server, nil
}

func (m *Manager) saveServer(server Server) error {
    metaPath := filepath.Join(server.ComposeDir, "server.json")
    data, err := json.MarshalIndent(server, "", "  ")
    if err != nil {
        return err
    }
    return os.WriteFile(metaPath, data, 0o644)
}

func (m *Manager) checkPortAvailable(port int) error {
    servers, err := m.List(context.Background())
    if err != nil {
        return err
    }
    for _, server := range servers {
        if server.Port == port {
            return fmt.Errorf("port %d is already in use", port)
        }
    }
    return nil
}

func (m *Manager) runningServerOnPort(ctx context.Context, port int, ignoreID string) (bool, string, error) {
    servers, err := m.List(ctx)
    if err != nil {
        return false, "", err
    }
    for _, server := range servers {
        if server.Port != port || server.ID == ignoreID {
            continue
        }
        if server.Status == "running" {
            return true, server.ID, nil
        }
    }
    return false, "", nil
}

func (m *Manager) GetLogsPath(ctx context.Context, id string) (string, error) {
    server, err := m.loadServer(id)
    if err != nil {
        return "", err
    }
    logPath := filepath.Join(server.ComposeDir, "data", "logs", "latest.log")
    return logPath, nil
}

func (m *Manager) GetPropertiesPath(ctx context.Context, id string) (string, error) {
    server, err := m.loadServer(id)
    if err != nil {
        return "", err
    }
    propsPath := filepath.Join(server.ComposeDir, "data", "server.properties")
    return propsPath, nil
}

func sanitizeName(input string) string {
    trimmed := strings.TrimSpace(input)
    if trimmed == "" {
        return "minecraft-server"
    }
    var builder strings.Builder
    for _, r := range trimmed {
        if unicode.IsControl(r) {
            continue
        }
        builder.WriteRune(r)
    }
    return builder.String()
}
