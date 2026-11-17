package com.quickkart.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;

import java.net.InetSocketAddress;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientIpFilterTest {

    private static MockServerHttpRequest from(String peer, String realIp) {
        var builder = MockServerHttpRequest.get("/api/auth/login")
                .remoteAddress(new InetSocketAddress(peer, 40000));
        if (realIp != null) builder.header("X-Real-IP", realIp);
        return builder.build();
    }

    @Test
    void trustsRealIpFromOurNginxInsideTheDockerNetwork() {
        assertEquals("203.0.113.9", ClientIpFilter.resolve(from("172.18.0.5", "203.0.113.9")));
    }

    @Test
    void ignoresRealIpSentByAnExternalClient() {
        assertEquals("198.51.100.20", ClientIpFilter.resolve(from("198.51.100.20", "203.0.113.9")));
    }

    @Test
    void rejectsMalformedHeaderValues() {
        assertEquals("10.0.0.3", ClientIpFilter.resolve(from("10.0.0.3", "not an ip; drop table")));
    }
}
