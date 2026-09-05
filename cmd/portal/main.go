package main

import (
    "encoding/json"
    "flag"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "path/filepath"
    "strings"
    "time"

    "mc-hammer/internal/server"
)

func main() {
    port := flag.Int("port", 8080, "port the portal listens on")
    flag.Parse()
    if *port < 1 || *port > 65535 {
        log.Fatalf("invalid port %d: must be between 1 and 65535", *port)
    }

    baseDir := filepath.Join("./servers")
    manager, err := server.NewManager(baseDir)
    if err != nil {
        log.Fatalf("failed to initialize server manager: %v", err)
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/api/servers", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            listServers(w, r, manager)
        case http.MethodPost:
            createServer(w, r, manager)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })

    mux.HandleFunc("/api/servers/", func(w http.ResponseWriter, r *http.Request) {
        // Parse /api/servers/{id} or /api/servers/{id}/logs
        path := strings.TrimPrefix(r.URL.Path, "/api/servers/")
        parts := strings.Split(path, "/")
        if len(parts) == 0 || parts[0] == "" {
            http.Error(w, "server id required", http.StatusBadRequest)
            return
        }
        
        id := parts[0]
        
        if len(parts) == 2 && parts[1] == "logs" {
            // GET /api/servers/{id}/logs
            if r.Method == http.MethodGet {
                getServerLogs(w, r, manager, id)
            } else {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            }
            return
        }
        if len(parts) == 2 && parts[1] == "properties" {
            switch r.Method {
            case http.MethodGet:
                getServerProperties(w, r, manager, id)
            case http.MethodPost:
                saveServerProperties(w, r, manager, id)
            default:
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            }
            return
        }
        if len(parts) == 2 && parts[1] == "command" {
            if r.Method == http.MethodPost {
                executeServerCommand(w, r, manager, id)
            } else {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            }
            return
        }
        if len(parts) == 2 && parts[1] == "action" {
            switch r.Method {
            case http.MethodPost:
                action := r.URL.Query().Get("type")
                if action == "start" {
                    startServer(w, r, manager, id)
                    return
                }
                if action == "stop" {
                    stopServer(w, r, manager, id)
                    return
                }
                http.Error(w, "invalid action", http.StatusBadRequest)
                return
            default:
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            }
            return
        }
        
        // /api/servers/{id}
        switch r.Method {
        case http.MethodGet:
            getServer(w, r, manager, id)
        case http.MethodPut:
            updateServer(w, r, manager, id)
        case http.MethodDelete:
            deleteServer(w, r, manager, id)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })

    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/" {
            http.ServeFile(w, r, "web/static/index.html")
            return
        }
        if r.URL.Path == "/server" || r.URL.Path == "/server.html" {
            http.ServeFile(w, r, "web/static/server.html")
            return
        }
        http.NotFound(w, r)
    })

    mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

    srv := &http.Server{
        Addr:         fmt.Sprintf(":%d", *port),
        Handler:      mux,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    log.Printf("starting mc-hammer portal on http://localhost:%d", *port)
    if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
        log.Fatalf("server error: %v", err)
    }
}

func listServers(w http.ResponseWriter, r *http.Request, manager *server.Manager) {
    servers, err := manager.List(r.Context())
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    if servers == nil {
        servers = []server.Server{}
    }
    writeJSON(w, servers)
}

func getServer(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    entry, err := manager.Get(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    writeJSON(w, entry)
}

func createServer(w http.ResponseWriter, r *http.Request, manager *server.Manager) {
    var req server.CreateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    if req.Name == "" {
        http.Error(w, "name is required", http.StatusBadRequest)
        return
    }
    if req.Port == 0 {
        http.Error(w, "port is required", http.StatusBadRequest)
        return
    }

    entry, err := manager.Create(r.Context(), req)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    w.WriteHeader(http.StatusCreated)
    writeJSON(w, entry)
}

func updateServer(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    var req server.UpdateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    entry, err := manager.Update(r.Context(), id, req)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    writeJSON(w, entry)
}

func deleteServer(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    if err := manager.Delete(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func startServer(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    if err := manager.Start(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func stopServer(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    if err := manager.Stop(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func getServerProperties(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    propsPath, err := manager.GetPropertiesPath(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    data, err := os.ReadFile(propsPath)
    if err != nil {
        if os.IsNotExist(err) {
            data = []byte("# server.properties\n")
        } else {
            http.Error(w, "failed to read properties", http.StatusInternalServerError)
            return
        }
    }
    writeJSON(w, map[string]string{"content": string(data)})
}

func saveServerProperties(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    propsPath, err := manager.GetPropertiesPath(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    var req struct {
        Content string `json:"content"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    if err := os.WriteFile(propsPath, []byte(req.Content), 0o644); err != nil {
        http.Error(w, "failed to save properties", http.StatusInternalServerError)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func executeServerCommand(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    var req struct {
        Command string `json:"command"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    if strings.TrimSpace(req.Command) == "" {
        http.Error(w, "command is required", http.StatusBadRequest)
        return
    }
    output, err := manager.ExecCommand(r.Context(), id, req.Command)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    w.Header().Set("Content-Type", "text/plain; charset=utf-8")
    _, _ = w.Write([]byte(output))
}

func getServerLogs(w http.ResponseWriter, r *http.Request, manager *server.Manager, id string) {
    logPath, err := manager.GetLogsPath(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    
    file, err := os.Open(logPath)
    if err != nil {
        http.Error(w, "logs not available", http.StatusNotFound)
        return
    }
    defer file.Close()
    
    w.Header().Set("Content-Type", "text/plain; charset=utf-8")
    io.Copy(w, file)
}

func writeJSON(w http.ResponseWriter, value interface{}) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(value)
}
