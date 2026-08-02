package server

import (
    "context"
    "fmt"
    "os/exec"
    "strings"
)

func RunDockerExec(ctx context.Context, containerName, command string) (string, error) {
    args := []string{"exec", "-i", containerName, "rcon-cli"}
    // Pass the command as a single argument to rcon-cli.
    args = append(args, strings.Split(command, " ")...)
    cmd := exec.CommandContext(ctx, "docker", args...)
    output, err := cmd.CombinedOutput()
    if err != nil {
        return strings.TrimSpace(string(output)), fmt.Errorf("docker exec failed: %v: %s", err, strings.TrimSpace(string(output)))
    }
    return strings.TrimSpace(string(output)), nil
}
