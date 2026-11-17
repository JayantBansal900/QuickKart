package com.quickkart.service;

import com.quickkart.dto.UpdateUserStatusRequest;
import com.quickkart.dto.UserAdminResponse;
import com.quickkart.entity.User;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.repository.UserRepository;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AdminUserService {

    private final UserRepository userRepository;

    public AdminUserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<UserAdminResponse> getAllUsers() {
        return userRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream()
                .map(UserAdminResponse::fromEntity)
                .collect(Collectors.toList());
    }

    /** Paged user list, newest first. {@code q} matches name, email or exact id; {@code role} USER/ADMIN; {@code status} account status. */
    @Transactional(readOnly = true)
    public com.quickkart.dto.PageResponse<UserAdminResponse> searchUsers(String q, String role, String status, int page, int size) {
        String query = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
        org.springframework.data.jpa.domain.Specification<User> spec = (root, cq, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> where = new java.util.ArrayList<>();
            if (role != null && !role.isBlank() && !"ALL".equalsIgnoreCase(role))
                where.add(cb.equal(root.get("role"), role.trim().toUpperCase(java.util.Locale.ROOT)));
            if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status))
                where.add(cb.equal(root.get("accountStatus"), status.trim().toUpperCase(java.util.Locale.ROOT)));
            if (!query.isEmpty()) {
                String like = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                java.util.List<jakarta.persistence.criteria.Predicate> any = new java.util.ArrayList<>(java.util.List.of(
                        cb.like(cb.lower(root.get("name")), like, '\\'),
                        cb.like(cb.lower(root.get("email")), like, '\\')));
                if (query.matches("\\d{1,18}")) any.add(cb.equal(root.get("id"), Long.parseLong(query)));
                where.add(cb.or(any.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return cb.and(where.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        var pageable = org.springframework.data.domain.PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
        return com.quickkart.dto.PageResponse.from(userRepository.findAll(spec, pageable), UserAdminResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public UserAdminResponse getUserById(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        return UserAdminResponse.fromEntity(user);
    }

    @Transactional
    public UserAdminResponse updateUserStatus(Long userId, UpdateUserStatusRequest request, String actingAdminEmail) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        // Guard rails: an admin must not lock themselves out, and admin accounts are not managed
        // from this screen (otherwise one compromised admin could suspend every other admin).
        if (user.getEmail().equalsIgnoreCase(actingAdminEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot change the status of your own account.");
        }
        if ("ADMIN".equals(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Administrator accounts cannot be changed from user management.");
        }

        user.setAccountStatus(request.getStatus().trim().toUpperCase());
        user.setUpdatedAt(LocalDateTime.now());
        User updated = userRepository.save(user);

        return UserAdminResponse.fromEntity(updated);
    }
}
