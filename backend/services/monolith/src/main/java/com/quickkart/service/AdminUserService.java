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
