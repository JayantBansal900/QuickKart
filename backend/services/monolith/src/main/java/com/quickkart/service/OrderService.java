package com.quickkart.service;
import com.quickkart.dto.*;
import com.quickkart.entity.*;
import com.quickkart.repository.*;
import com.quickkart.exception.*;
import com.quickkart.event.OrderCreatedInternalEvent;
import jakarta.persistence.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
@Service
public class OrderService {
    private final OrderRepository orders;
    private final CartRepository carts;
    private final CartItemRepository cartItems;
    private final ProductRepository products;
    private final UserRepository users;
    private final PaymentRepository payments;
    private final ApplicationEventPublisher events;
    @PersistenceContext private EntityManager entityManager;
    public OrderService(OrderRepository orders, CartRepository carts, CartItemRepository cartItems,
                        ProductRepository products, UserRepository users, PaymentRepository payments, ApplicationEventPublisher events) {
        this.orders=orders;this.carts=carts;this.cartItems=cartItems;this.products=products;
        this.users=users;this.payments=payments;this.events=events;
    }
    // Fail closed for old clients: they must obtain a current quote and supply a durable key and delivery details.
    public OrderResponse checkout(String email) { throw bad("Checkout details and idempotency key are required"); }
    public OrderResponse checkout(String email,String method) { throw bad("Checkout details and idempotency key are required"); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
    private static String required(String value,int min,int max,String field) {
        if(value==null || value.trim().length()<min || value.trim().length()>max) throw bad("Invalid "+field);
        return value.trim();
    }
    @Transactional
    public OrderResponse checkout(String email,CheckoutRequest request) {
        if(request==null) throw bad("Checkout details are required");
        if(!"COD".equals(request.getPaymentMethod())) throw bad("Online payments are unavailable. Only cash on delivery is supported.");
        String key=required(request.getIdempotencyKey(),1,80,"idempotency key");
        String quote=required(request.getCartFingerprint(),1,64,"cart confirmation");
        String name=required(request.getRecipientName(),1,120,"recipient name");
        String address=required(request.getDeliveryAddress(),8,1000,"delivery address");
        String phone=required(request.getDeliveryPhone(),5,40,"delivery phone");
        String payload=CartQuote.hash(String.join("|", "COD",quote,CartQuote.hash(name),CartQuote.hash(address),CartQuote.hash(phone)));
        // Shared account lock serializes cart creation, mutation and checkout, even across the two services.
        User user=users.findByEmailForUpdate(email).orElseThrow(()->new ResourceNotFoundException("Account not found"));
        entityManager.refresh(user,LockModeType.PESSIMISTIC_WRITE);
        if(!user.isEmailVerified() || !"ACTIVE".equals(user.getAccountStatus())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Account is not active");
        Order previous=orders.findByUserIdAndCheckoutKey(user.getId(),key).orElse(null);
        if(previous!=null) {
            if(!payload.equals(previous.getRequestFingerprint())) throw conflict("Idempotency key was already used with different checkout details");
            return response(previous);
        }
        Cart cart=carts.findByUserId(user.getId()).orElseThrow(()->new EmptyCartException("Cart is empty"));
        List<CartItem> lines=cartItems.findByCartId(cart.getId()).stream().sorted(Comparator.comparing(i->i.getProduct().getId())).toList();
        if(lines.isEmpty()) throw new EmptyCartException("Cart is empty");
        for(CartItem line:lines) {
            Product product=products.findByIdForUpdate(line.getProduct().getId()).orElseThrow(()->new ProductNotFoundException(line.getProduct().getId()));
            // A cart relationship may already have loaded this entity before waiting for its lock.
            entityManager.refresh(product,LockModeType.PESSIMISTIC_WRITE);
            if(line.getQuantity()==null || line.getQuantity()<1) throw bad("Invalid cart quantity");
            if(product.getPrice()==null || product.getPrice().signum()<0) throw conflict("Product price is unavailable");
            if(product.getStockQuantity()<line.getQuantity() || "OUT_OF_STOCK".equalsIgnoreCase(product.getAvailability()) || "DISCONTINUED".equalsIgnoreCase(product.getAvailability()) || "UNAVAILABLE".equalsIgnoreCase(product.getAvailability()))
                throw new InsufficientStockException("Product unavailable or insufficient stock: "+product.getName());
        }
        if(!quote.equals(CartQuote.fingerprint(lines))) throw conflict("Cart contents or prices changed. Refresh and confirm the updated total before placing the order.");
        Order order=new Order(user,BigDecimal.ZERO,"CONFIRMED",LocalDateTime.now());
        order.setCheckoutKey(key);order.setRequestFingerprint(payload);order.setRecipientName(name);order.setDeliveryAddress(address);order.setDeliveryPhone(phone);
        BigDecimal total=BigDecimal.ZERO;
        for(CartItem line:lines) {
            Product product=line.getProduct();
            total=total.add(product.getPrice().multiply(BigDecimal.valueOf(line.getQuantity())));
            product.setStockQuantity(product.getStockQuantity()-line.getQuantity());
            order.addItem(new OrderItem(order,product,line.getQuantity(),product.getPrice()));
        }
        order.setTotalAmount(total);
        orders.saveAndFlush(order);
        // This reference identifies an unpaid collection record; it is not a provider transaction.
        payments.save(new Payment(order,total,"COLLECTION_PENDING","COD","COD-"+UUID.randomUUID(),LocalDateTime.now()));
        cartItems.deleteByCartId(cart.getId());
        entityManager.flush();
        events.publishEvent(new OrderCreatedInternalEvent(order.getId(),user.getId(),total,order.getCreatedAt(),
            order.getItems().stream().map(i->new OrderItemSummary(i.getProduct().getId(),i.getProductName(),i.getQuantity(),i.getPrice())).toList()));
        return response(order);
    }
    @Transactional(readOnly=true)
    public List<OrderResponse> getUserOrders(String email) {
        User user=user(email); return orders.findByUserIdOrderByCreatedAtDesc(user.getId()).stream().map(this::response).toList();
    }
    @Transactional(readOnly=true)
    public OrderResponse getOrderById(String email,Long id) {
        return response(orders.findByIdAndUserId(id,user(email).getId()).orElseThrow(()->new OrderNotFoundException(id)));
    }
    @Transactional(readOnly=true)
    public OrderResponse getOrderById(Long id,String email) { return getOrderById(email,id); }
    @Transactional(readOnly=true)
    public List<OrderResponse> getAllOrders() { return orders.findAll(Sort.by(Sort.Direction.DESC,"createdAt")).stream().map(this::response).toList(); }
    @Transactional(readOnly=true)
    public OrderResponse getOrderByIdForAdmin(Long id) { return response(orders.findById(id).orElseThrow(()->new OrderNotFoundException(id))); }
    @Transactional
    public OrderResponse cancelOrder(String email,Long id) {
        Order order=lockedOrder(id);
        if(!order.getUser().getId().equals(user(email).getId())) throw new OrderNotFoundException(id);
        return transition(order,"CANCELLED",email);
    }
    @Transactional
    public OrderResponse updateOrderStatus(Long id,String status) { return transition(lockedOrder(id),status,"ADMIN"); }
    private Order lockedOrder(Long id) {
        Order order=orders.findByIdForUpdate(id).orElseThrow(()->new OrderNotFoundException(id));
        entityManager.refresh(order,LockModeType.PESSIMISTIC_WRITE);return order;
    }
    private OrderResponse transition(Order order,String next,String actor) {
        if(next==null) throw new InvalidOrderStatusException("Order status is required");
        next=next.trim().toUpperCase(Locale.ROOT);
        if(!Set.of("PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED").contains(next)) throw new InvalidOrderStatusException("Invalid order status");
        if(next.equals(order.getStatus())) return response(order);
        Set<String> allowed=switch(order.getStatus()) {
            case "PENDING" -> Set.of("CONFIRMED","CANCELLED");
            case "CONFIRMED" -> Set.of("PROCESSING","CANCELLED");
            case "PROCESSING" -> Set.of("SHIPPED","CANCELLED");
            case "SHIPPED" -> Set.of("DELIVERED");
            default -> Set.of();
        };
        if(!allowed.contains(next)) throw conflict("Order cannot transition from "+order.getStatus()+" to "+next);
        Payment payment=payments.findByOrderId(order.getId()).orElse(null);
        if("CANCELLED".equals(next)) {
            // Historical stock provenance is unknown: do not guess whether legacy orders need restocking.
            if(order.getCheckoutKey()==null) throw conflict("Legacy order cancellation requires manual inventory review");
            for(OrderItem item:order.getItems().stream().sorted(Comparator.comparing(i->i.getProduct().getId())).toList()) {
                Product product=products.findByIdForUpdate(item.getProduct().getId()).orElseThrow(()->new ProductNotFoundException(item.getProduct().getId()));
                entityManager.refresh(product,LockModeType.PESSIMISTIC_WRITE);
                product.setStockQuantity(Math.addExact(product.getStockQuantity(),item.getQuantity()));
            }
            order.setCancelledAt(LocalDateTime.now());order.setCancelledBy(actor);
            if(payment!=null) payment.setStatus("COLLECTION_PENDING".equals(payment.getStatus()) ? "CANCELLED" : "MANUAL_REVIEW_REQUIRED");
        } else if(order.getCheckoutKey()==null || payment==null || !"COD".equals(payment.getPaymentMethod()) || !"COLLECTION_PENDING".equals(payment.getStatus())) {
            throw conflict("Payment requires manual review before fulfillment");
        }
        order.setStatus(next);return response(order);
    }
    private User user(String email) {return users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Account not found"));}
    private OrderResponse response(Order order) {
        Payment payment=payments.findByOrderId(order.getId()).orElse(null);
        String status=payment==null ? "UNKNOWN" : "SUCCESS".equals(payment.getStatus()) ? "LEGACY_UNVERIFIED" : payment.getStatus();
        return OrderResponse.fromEntity(order,payment==null ? "UNKNOWN" : payment.getPaymentMethod(),status);
    }
}
