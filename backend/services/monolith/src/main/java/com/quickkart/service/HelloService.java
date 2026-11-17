package com.quickkart.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class HelloService {

    public Map<String, String> getHelloMessage() {
        return Map.of("message", "QuickKart backend is running");
    }
}
