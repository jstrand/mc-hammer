package server

import (
    "context"
    "fmt"
    "log"
    "os/exec"
    "path/filepath"
    "strings"
)

func RunComposeUp(ctx context.Context, composePath string) error {
    log.Printf("[docker-compose] starting: docker compose -f %s up -d", composePath)
    cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "up", "-d")
    output, err := cmd.CombinedOutput()
    if output != nil {
        log.Printf("[docker-compose output] %s", strings.TrimSpace(string(output)))
    }
    if err != nil {
        log.Printf("[docker-compose error] failed with exit code %v", err)
        return fmt.Errorf("docker compose up failed: %v: %s", err, strings.TrimSpace(string(output)))
    }
    log.Printf("[docker-compose] up completed successfully")
    return nil
}

func RunComposeDown(ctx context.Context, composePath string) error {
    log.Printf("[docker-compose] stopping: docker compose -f %s down -v", composePath)
    cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "down", "-v")
    output, err := cmd.CombinedOutput()
    if output != nil {
        log.Printf("[docker-compose output] %s", strings.TrimSpace(string(output)))
    }
    if err != nil {
        log.Printf("[docker-compose error] failed with exit code %v", err)
        return fmt.Errorf("docker compose down failed: %v: %s", err, strings.TrimSpace(string(output)))
    }
    log.Printf("[docker-compose] down completed successfully")
    return nil
}

func RunComposeStop(ctx context.Context, composePath string) error {
    log.Printf("[docker-compose] stopping containers: docker compose -f %s stop", composePath)
    cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "stop")
    output, err := cmd.CombinedOutput()
    if output != nil {
        log.Printf("[docker-compose output] %s", strings.TrimSpace(string(output)))
    }
    if err != nil {
        log.Printf("[docker-compose error] failed with exit code %v", err)
        return fmt.Errorf("docker compose stop failed: %v: %s", err, strings.TrimSpace(string(output)))
    }
    log.Printf("[docker-compose] stop completed successfully")
    return nil
}

func ComposeStatus(ctx context.Context, composePath string) (string, error) {
    cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "ps", "--format", "json")
    output, err := cmd.CombinedOutput()
    if err != nil {
        log.Printf("[docker-compose] ps failed: %v", err)
        return "unknown", fmt.Errorf("docker compose ps failed: %v: %s", err, strings.TrimSpace(string(output)))
    }
    if strings.Contains(string(output), "Running") {
        return "running", nil
    }
    return "stopped", nil
}

func ContainerName(id string) string {
    return fmt.Sprintf("mc-%s", id)
}

func ComposeFilePath(dir string) string {
    return filepath.Join(dir, "docker-compose.yml")
}
