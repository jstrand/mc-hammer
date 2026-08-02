package server

import "time"

type Server struct {
    ID         string    `json:"id"`
    Name       string    `json:"name"`
    Port       int       `json:"port"`
    Status     string    `json:"status"`
    CreatedAt  time.Time `json:"createdAt"`
    ComposeDir string    `json:"composeDir"`
}

type CreateRequest struct {
    Name string `json:"name"`
    Port int    `json:"port"`
}
