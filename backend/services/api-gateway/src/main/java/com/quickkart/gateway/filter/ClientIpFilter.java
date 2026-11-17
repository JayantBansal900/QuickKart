package com.quickkart.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetAddress;
import java.net.InetSocketAddress;

/**
 * Resolves the real browser IP once, at the gateway (the trust boundary), and
 * forwards it to downstream services as {@value #CLIENT_IP_HEADER}.
 *
 * Why: downstream services only ever see the gateway's container IP, so any
 * per-IP rate limit there would put every user into one shared bucket.
 *
 * Trust rule: a client-supplied X-Real-IP is honoured only when the request
 * arrived from a private/loopback address (our own nginx in the Docker
 * network). Requests from anywhere else are keyed by their socket address,
 * and any incoming X-Client-IP is always overwritten so it cannot be spoofed.
 */
@Component
public class ClientIpFilter implements GlobalFilter, Ordered {

    public static final String CLIENT_IP_HEADER = "X-Client-IP";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String clientIp = resolve(request);
        ServerHttpRequest forwarded = request.mutate()
                .headers(headers -> headers.set(CLIENT_IP_HEADER, clientIp))
                .build();
        return chain.filter(exchange.mutate().request(forwarded).build());
    }

    static String resolve(ServerHttpRequest request) {
        InetSocketAddress remote = request.getRemoteAddress();
        InetAddress peer = remote == null ? null : remote.getAddress();
        String peerIp = peer == null ? "unknown" : peer.getHostAddress();
        if (peer != null && isInternal(peer)) {
            String realIp = request.getHeaders().getFirst("X-Real-IP");
            if (realIp != null && realIp.matches("[0-9a-fA-F:.]{2,45}")) {
                return realIp;
            }
        }
        return peerIp;
    }

    private static boolean isInternal(InetAddress address) {
        return address.isLoopbackAddress() || address.isSiteLocalAddress();
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
