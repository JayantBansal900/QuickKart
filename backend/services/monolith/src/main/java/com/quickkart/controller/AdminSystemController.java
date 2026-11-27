package com.quickkart.controller;

import com.quickkart.service.SystemStatusService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Admin-only operational health. Replaces the old public "developer tools" screens. */
@RestController
@RequestMapping("/api/admin/system")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSystemController {

    private final SystemStatusService systemStatusService;
    private final com.quickkart.service.SystemDiagnosticsService diagnostics;

    public AdminSystemController(SystemStatusService systemStatusService, com.quickkart.service.SystemDiagnosticsService diagnostics) {
        this.systemStatusService = systemStatusService;
        this.diagnostics = diagnostics;
    }

    /** Troubleshooting view of one component: numbers, problems found, what to do, safe fixes. */
    @GetMapping("/components/{key}")
    public ResponseEntity<com.quickkart.service.SystemDiagnosticsService.ComponentDetail> component(@org.springframework.web.bind.annotation.PathVariable String key) {
        return ResponseEntity.ok(diagnostics.details(key));
    }

    /** Runs one of the safe fixes offered by the component view (for example clearing the product cache). */
    @org.springframework.web.bind.annotation.PostMapping("/components/{key}/actions/{action}")
    public ResponseEntity<com.quickkart.service.SystemDiagnosticsService.ActionResult> run(
            @org.springframework.web.bind.annotation.PathVariable String key,
            @org.springframework.web.bind.annotation.PathVariable String action,
            org.springframework.security.core.Authentication auth) {
        return ResponseEntity.ok(diagnostics.run(key, action, auth.getName()));
    }

    @GetMapping("/status")
    public ResponseEntity<SystemStatusService.SystemStatus> status() {
        return ResponseEntity.ok(systemStatusService.check());
    }
}
