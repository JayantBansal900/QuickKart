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

    public AdminSystemController(SystemStatusService systemStatusService) {
        this.systemStatusService = systemStatusService;
    }

    @GetMapping("/status")
    public ResponseEntity<SystemStatusService.SystemStatus> status() {
        return ResponseEntity.ok(systemStatusService.check());
    }
}
