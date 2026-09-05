package server

import "testing"

func TestValidateVersionAccepts(t *testing.T) {
    cases := map[string]string{
        "1.21.11":   "1.21.11",
        "LATEST":    "LATEST",
        "SNAPSHOT":  "SNAPSHOT",
        "23w13a":    "23w13a",
        "b1.7.3":    "b1.7.3",
        "  1.20.1 ": "1.20.1",
        "":          defaultVersion,
    }
    for input, want := range cases {
        got, err := validateVersion(input)
        if err != nil {
            t.Errorf("validateVersion(%q) returned error: %v", input, err)
            continue
        }
        if got != want {
            t.Errorf("validateVersion(%q) = %q, want %q", input, got, want)
        }
    }
}

func TestValidateVersionRejects(t *testing.T) {
    // Each of these would either break out of the double-quoted YAML scalar or
    // be interpolated by Compose before the daemon ever sees it.
    cases := []string{
        `1.21"`,
        "1.21\nservices:",
        `${HOME}`,
        `$USER`,
        `1.21\`,
        "1.21 latest",
        "#comment",
        "a/../b",
        "1234567890123456789012345678901234567890",
    }
    for _, input := range cases {
        if got, err := validateVersion(input); err == nil {
            t.Errorf("validateVersion(%q) = %q, want error", input, got)
        }
    }
}
