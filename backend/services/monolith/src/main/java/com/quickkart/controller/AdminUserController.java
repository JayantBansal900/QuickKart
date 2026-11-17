package com.quickkart.controller;

import com.quickkart.dto.UpdateUserStatusRequest;
import com.quickkart.dto.UserAdminResponse;
import com.quickkart.service.AdminUserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    /** Paged, newest first; optional search ({@code q}), {@code role} and {@code status} filters. */
    @GetMapping
    public ResponseEntity<com.quickkart.dto.PageResponse<UserAdminResponse>> getAllUsers(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String q,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String role,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String status,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") int page,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "25") int size) {
        return ResponseEntity.ok(adminUserService.searchUsers(q, role, status, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserAdminResponse> getUserById(@PathVariable Long id) {
        UserAdminResponse user = adminUserService.getUserById(id);
        return ResponseEntity.ok(user);
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<UserAdminResponse> updateUserStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserStatusRequest request,
            org.springframework.security.core.Authentication authentication) {
        UserAdminResponse updated = adminUserService.updateUserStatus(id, request, authentication.getName());
        return ResponseEntity.ok(updated);
    }
}
