package com.quickkart.order.service;
import com.quickkart.order.dto.*;
import com.quickkart.order.entity.*;
import com.quickkart.order.repository.*;
import com.quickkart.order.exception.*;
import com.quickkart.order.event.OrderCreatedInternalEvent;
import com.quickkart.order.event.OrderLifecycleInternalEvent;
import jakarta.persistence.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
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
    private final StockMovementRepository stockMovements;
    private final CouponService coupons;
    private final OrderReturnRepository returns;
    /** Customers can ask for a return this many days after delivery. */
    static final int RETURN_WINDOW_DAYS=7;
    static final Set<String> RETURN_REASONS=Set.of("DAMAGED","WRONG_ITEM","NOT_AS_DESCRIBED","NO_LONGER_NEEDED","OTHER");
    @PersistenceContext private EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Value("${app.payments.simulated-online.enabled:true}")
    private boolean simulatedOnlinePayments=true;
    /** Payment methods checkout accepts right now (COD always; UPI/CARD only while the simulated gateway is on). */
    public List<String> paymentMethods() { return simulatedOnlinePayments ? List.of("COD","UPI","CARD") : List.of("COD"); }
    static final Set<String> PAYMENT_METHODS=Set.of("COD","UPI","CARD");
    static final Set<String> STATUSES=Set.of("PENDING","PLACED","CONFIRMED","PROCESSING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED");
    public OrderService(OrderRepository orders, CartRepository carts, CartItemRepository cartItems,
                        ProductRepository products, UserRepository users, PaymentRepository payments, ApplicationEventPublisher events,
                        StockMovementRepository stockMovements, CouponService coupons, OrderReturnRepository returns) {
        this.stockMovements=stockMovements;this.coupons=coupons;this.returns=returns;
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
        String method=request.getPaymentMethod()==null ? "" : request.getPaymentMethod().trim().toUpperCase(Locale.ROOT);
        if(!PAYMENT_METHODS.contains(method)) throw bad("Unsupported payment method. Choose COD, UPI or CARD.");
        boolean online=!"COD".equals(method);
        if(online && !simulatedOnlinePayments) throw bad("Online payment is not available. Please choose cash on delivery.");
        String key=required(request.getIdempotencyKey(),1,80,"idempotency key");
        String quote=required(request.getCartFingerprint(),1,64,"cart confirmation");
        String name=required(request.getRecipientName(),1,120,"recipient name");
        String address=required(request.getDeliveryAddress(),8,1000,"delivery address");
        String phone=required(request.getDeliveryPhone(),5,40,"delivery phone");
        String couponCode=request.getCouponCode()==null || request.getCouponCode().isBlank() ? null : CouponService.clean(request.getCouponCode());
        String payload=CartQuote.hash(String.join("|", method,quote,CartQuote.hash(name),CartQuote.hash(address),CartQuote.hash(phone))
            +(couponCode==null ? "" : "|coupon:"+couponCode));
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
        // COD orders are placed straight away; online orders wait in PENDING until the payment succeeds.
        Order order=new Order(user,BigDecimal.ZERO,online ? "PENDING" : "PLACED",LocalDateTime.now());
        order.setCheckoutKey(key);order.setRequestFingerprint(payload);order.setRecipientName(name);order.setDeliveryAddress(address);order.setDeliveryPhone(phone);
        BigDecimal total=BigDecimal.ZERO;
        for(CartItem line:lines) {
            Product product=line.getProduct();
            total=total.add(product.getPrice().multiply(BigDecimal.valueOf(line.getQuantity())));
            product.setStockQuantity(product.getStockQuantity()-line.getQuantity());
            order.addItem(new OrderItem(order,product,line.getQuantity(),product.getPrice()));
        }
        order.setSubtotalAmount(total);
        if(couponCode!=null) {
            // Validated again under the coupon's row lock; an invalid code fails the whole checkout (nothing is saved).
            var applied=coupons.redeem(couponCode,user.getId(),total);
            order.setCouponCode(applied.code());order.setDiscountAmount(applied.discount());
            total=applied.total();
        }
        order.setTotalAmount(total);
        orders.saveAndFlush(order);
        for(OrderItem item:order.getItems())
            stockMovements.save(new StockMovement(item.getProduct().getId(),-item.getQuantity(),item.getProduct().getStockQuantity(),"ORDER_PLACED","Order #"+order.getId(),email));
        // COD: an unpaid collection record. Online: a simulated gateway payment awaiting the customer.
        Payment payment=online
            ? new Payment(order,total,"PENDING",method,"SIM-"+UUID.randomUUID(),LocalDateTime.now())
            : new Payment(order,total,"COLLECTION_PENDING","COD","COD-"+UUID.randomUUID(),LocalDateTime.now());
        payments.save(payment);
        cartItems.deleteByCartId(cart.getId());
        entityManager.flush();
        events.publishEvent(new OrderCreatedInternalEvent(order.getId(),user.getId(),total,order.getCreatedAt(),
            order.getItems().stream().map(i->new OrderItemSummary(i.getProduct().getId(),i.getProductName(),i.getQuantity(),i.getPrice())).toList(),
            order.getStatus(),payment.getPaymentMethod(),payment.getStatus()));
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
    /** Admin list: newest first, optional status filter and search by order id, customer email or recipient. */
    @Transactional(readOnly=true)
    public PageResponse<OrderResponse> searchForAdmin(String query,String status,int page,int size) {
        String q=query==null ? "" : query.trim().toLowerCase(Locale.ROOT).replaceFirst("^#","");
        String st=status==null || status.isBlank() || "ALL".equalsIgnoreCase(status) ? null : status.trim().toUpperCase(Locale.ROOT);
        Specification<Order> spec=(root,cq,cb)->{
            List<jakarta.persistence.criteria.Predicate> where=new ArrayList<>();
            if(st!=null) where.add(cb.equal(root.get("status"),st));
            if(!q.isEmpty()) {
                var user=root.join("user");
                String like="%"+q.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
                List<jakarta.persistence.criteria.Predicate> any=new ArrayList<>(List.of(
                    cb.like(cb.lower(user.get("email")),like,'\\'),
                    cb.like(cb.lower(cb.coalesce(root.get("recipientName"),"")),like,'\\')));
                if(q.matches("\\d{1,18}")) any.add(cb.equal(root.get("id"),Long.parseLong(q)));
                where.add(cb.or(any.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return cb.and(where.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        var pageable=PageRequest.of(Math.max(0,page),Math.min(Math.max(1,size),100),Sort.by(Sort.Direction.DESC,"createdAt").and(Sort.by(Sort.Direction.DESC,"id")));
        return PageResponse.from(orders.findAll(spec,pageable),this::response);
    }
    @Transactional(readOnly=true)
    public OrderResponse getOrderByIdForAdmin(Long id) { return response(orders.findById(id).orElseThrow(()->new OrderNotFoundException(id))); }
    /**
     * Simulated payment gateway (test mode). A real integration would verify a provider callback
     * signature here; the state changes are the same: PENDING -> PAID moves the order to PLACED,
     * a failure leaves it PENDING so the customer can retry or cancel.
     */
    @Transactional
    public OrderResponse pay(String email,Long id,boolean succeed) {
        Order order=lockedOrder(id);
        if(!order.getUser().getId().equals(user(email).getId())) throw new OrderNotFoundException(id);
        Payment payment=payments.findByOrderId(order.getId()).orElseThrow(()->conflict("Order has no payment record"));
        if("COD".equals(payment.getPaymentMethod())) throw conflict("Cash on delivery orders are paid when they arrive");
        if(!simulatedOnlinePayments) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Online payment is not available");
        if("PAID".equals(payment.getStatus())) return response(order); // repeated success callback: idempotent
        if(!"PENDING".equals(order.getStatus())) throw conflict("Order is not awaiting payment");
        if(succeed) {
            payment.setStatus("PAID");
            payment.setTransactionId("SIM-"+UUID.randomUUID());
            order.setStatus("PLACED");
            publish(order,payment,"PAYMENT_SUCCEEDED","PAYMENT_SUCCEEDED-"+order.getId());
        } else {
            payment.setStatus("FAILED");
            publish(order,payment,"PAYMENT_FAILED","PAYMENT_FAILED-"+order.getId()+"-"+UUID.randomUUID());
        }
        return response(order);
    }
    /** Releases the stock of an online order that was never paid. Called by UnpaidOrderExpiry. */
    @Transactional
    public boolean expireUnpaid(Long id,LocalDateTime createdBefore) {
        Order order=lockedOrder(id);
        if(!"PENDING".equals(order.getStatus()) || !order.getCreatedAt().isBefore(createdBefore)) return false;
        transition(order,"CANCELLED","SYSTEM");
        return true;
    }
    @Transactional
    public OrderResponse cancelOrder(String email,Long id) {
        Order order=lockedOrder(id);
        if(!order.getUser().getId().equals(user(email).getId())) throw new OrderNotFoundException(id);
        return transition(order,"CANCELLED",email);
    }
    @Transactional
    public OrderResponse updateOrderStatus(Long id,String status) { return transition(lockedOrder(id),status,"ADMIN"); }
    /** Admin status change. Shipping needs the courier and tracking number (dispatch). */
    @Transactional
    public OrderResponse updateOrderStatus(Long id,UpdateOrderStatusRequest request) {
        Order order=lockedOrder(id);
        String next=request.getStatus()==null ? null : request.getStatus().trim().toUpperCase(Locale.ROOT);
        if("SHIPPED".equals(next)) {
            String courier=request.getCourier()==null ? "" : request.getCourier().trim();
            String tracking=request.getTrackingNumber()==null ? "" : request.getTrackingNumber().trim();
            if(courier.isEmpty() || tracking.isEmpty()) throw bad("Enter the courier and tracking number to dispatch the order");
            if(courier.length()>60 || tracking.length()>80 || !tracking.matches("[A-Za-z0-9-]+")) throw bad("Invalid courier or tracking number");
            order.setCourier(courier);order.setTrackingNumber(tracking.toUpperCase(Locale.ROOT));
        }
        return transition(order,next,"ADMIN");
    }

    // ---- returns ----
    /** Customer asks to return a delivered order within the return window. */
    @Transactional
    public OrderResponse requestReturn(String email,Long id,String reason,String comment) {
        Order order=lockedOrder(id);
        if(!order.getUser().getId().equals(user(email).getId())) throw new OrderNotFoundException(id);
        if(!"DELIVERED".equals(order.getStatus())) throw conflict("Only delivered orders can be returned");
        if(returns.findByOrderId(id).isPresent()) throw conflict("A return was already requested for this order");
        if(order.getDeliveredAt()!=null && order.getDeliveredAt().plusDays(RETURN_WINDOW_DAYS).isBefore(LocalDateTime.now()))
            throw conflict("The "+RETURN_WINDOW_DAYS+"-day return window for this order has ended");
        String r=reason==null ? "" : reason.trim().toUpperCase(Locale.ROOT);
        if(!RETURN_REASONS.contains(r)) throw bad("Choose a reason for the return");
        String note=comment==null || comment.isBlank() ? null : comment.trim();
        if(note!=null && note.length()>1000) throw bad("Comment is too long");
        returns.save(new OrderReturn(order,r,note));
        return response(order);
    }
    @Transactional(readOnly=true)
    public PageResponse<ReturnResponse> returnsForAdmin(String status,int page,int size) {
        var pageable=PageRequest.of(Math.max(0,page),Math.min(Math.max(1,size),100));
        var result=status==null || status.isBlank() || "ALL".equalsIgnoreCase(status)
            ? returns.findAllByOrderByRequestedAtDesc(pageable)
            : returns.findByStatusOrderByRequestedAtDesc(status.trim().toUpperCase(Locale.ROOT),pageable);
        return PageResponse.from(result,r->ReturnResponse.from(r,response(r.getOrder())));
    }
    /** Admin decision. Approving puts the stock back, refunds the payment and marks the order RETURNED. */
    @Transactional
    public ReturnResponse resolveReturn(Long returnId,boolean approve,String note) {
        OrderReturn ret=returns.findById(returnId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Return not found"));
        if(!"REQUESTED".equals(ret.getStatus())) throw conflict("This return was already "+ret.getStatus().toLowerCase(Locale.ROOT));
        Order order=lockedOrder(ret.getOrder().getId());
        String cleanNote=note==null || note.isBlank() ? null : note.trim();
        if(cleanNote!=null && cleanNote.length()>500) throw bad("Note is too long");
        if(approve) {
            for(OrderItem item:order.getItems().stream().sorted(Comparator.comparing(i->i.getProduct().getId())).toList()) {
                Product product=products.findByIdForUpdate(item.getProduct().getId()).orElseThrow(()->new ProductNotFoundException(item.getProduct().getId()));
                entityManager.refresh(product,LockModeType.PESSIMISTIC_WRITE);
                product.setStockQuantity(Math.addExact(product.getStockQuantity(),item.getQuantity()));
                stockMovements.save(new StockMovement(product.getId(),item.getQuantity(),product.getStockQuantity(),"ORDER_RETURNED","Order #"+order.getId(),"ADMIN"));
            }
            Payment payment=payments.findByOrderId(order.getId()).orElse(null);
            if(payment!=null) payment.setStatus("REFUNDED");
            order.setStatus("RETURNED");
            publish(order,payment,"ORDER_STATUS_CHANGED","ORDER_STATUS-"+order.getId()+"-RETURNED");
        }
        ret.resolve(approve ? "APPROVED" : "REJECTED",cleanNote);
        return ReturnResponse.from(ret,response(order));
    }
    private Order lockedOrder(Long id) {
        Order order=orders.findByIdForUpdate(id).orElseThrow(()->new OrderNotFoundException(id));
        entityManager.refresh(order,LockModeType.PESSIMISTIC_WRITE);return order;
    }
    private OrderResponse transition(Order order,String next,String actor) {
        if(next==null) throw new InvalidOrderStatusException("Order status is required");
        next=next.trim().toUpperCase(Locale.ROOT);
        if(!STATUSES.contains(next)) throw new InvalidOrderStatusException("Invalid order status");
        if(next.equals(order.getStatus())) return response(order);
        Payment payment=payments.findByOrderId(order.getId()).orElse(null);
        boolean cod=payment!=null && "COD".equals(payment.getPaymentMethod());
        Set<String> allowed=switch(order.getStatus()) {
            // PENDING -> PLACED happens only through a successful payment. Old COD rows in PENDING may still be confirmed.
            case "PENDING" -> cod ? Set.of("CONFIRMED","CANCELLED") : Set.of("CANCELLED");
            case "PLACED" -> Set.of("CONFIRMED","CANCELLED");
            case "CONFIRMED" -> Set.of("PROCESSING","CANCELLED");
            case "PROCESSING" -> Set.of("SHIPPED","CANCELLED");
            case "SHIPPED" -> Set.of("OUT_FOR_DELIVERY");
            case "OUT_FOR_DELIVERY" -> Set.of("DELIVERED");
            default -> Set.of();
        };
        if(!allowed.contains(next)) throw conflict("Order cannot transition from "+order.getStatus()+" to "+next);
        if("CANCELLED".equals(next)) {
            // Historical stock provenance is unknown: do not guess whether legacy orders need restocking.
            if(order.getCheckoutKey()==null) throw conflict("Legacy order cancellation requires manual inventory review");
            for(OrderItem item:order.getItems().stream().sorted(Comparator.comparing(i->i.getProduct().getId())).toList()) {
                Product product=products.findByIdForUpdate(item.getProduct().getId()).orElseThrow(()->new ProductNotFoundException(item.getProduct().getId()));
                entityManager.refresh(product,LockModeType.PESSIMISTIC_WRITE);
                product.setStockQuantity(Math.addExact(product.getStockQuantity(),item.getQuantity()));
                stockMovements.save(new StockMovement(product.getId(),item.getQuantity(),product.getStockQuantity(),"ORDER_CANCELLED","Order #"+order.getId(),actor));
            }
            order.setCancelledAt(LocalDateTime.now());order.setCancelledBy(actor);
            coupons.release(order.getCouponCode());
            if(payment!=null) payment.setStatus(switch(payment.getStatus()) {
                case "COLLECTION_PENDING","PENDING","FAILED" -> "CANCELLED";
                case "PAID" -> "REFUNDED"; // simulated gateway: the refund is immediate
                default -> "MANUAL_REVIEW_REQUIRED";
            });
        } else if(order.getCheckoutKey()==null || payment==null || !isSettledForFulfilment(payment)) {
            throw conflict("Payment requires manual review before fulfillment");
        } else if("DELIVERED".equals(next) && cod) {
            // Cash on delivery: the courier collects the money at hand-over, so delivery settles the payment.
            payment.setStatus("COLLECTED");
        }
        if("SHIPPED".equals(next)) order.setShippedAt(LocalDateTime.now());
        if("DELIVERED".equals(next)) order.setDeliveredAt(LocalDateTime.now());
        order.setStatus(next);
        publish(order,payment,"ORDER_STATUS_CHANGED","ORDER_STATUS-"+order.getId()+"-"+next);
        return response(order);
    }
    private static boolean isSettledForFulfilment(Payment payment) {
        return "COD".equals(payment.getPaymentMethod()) ? "COLLECTION_PENDING".equals(payment.getStatus()) : "PAID".equals(payment.getStatus());
    }
    private void publish(Order order,Payment payment,String type,String eventId) {
        events.publishEvent(new OrderLifecycleInternalEvent(eventId,type,order.getId(),order.getUser().getId(),order.getTotalAmount(),
            order.getStatus(),payment==null ? null : payment.getPaymentMethod(),payment==null ? null : payment.getStatus(),
            order.getCourier(),order.getTrackingNumber()));
    }
    private User user(String email) {return users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Account not found"));}
    private OrderResponse response(Order order) {
        Payment payment=payments.findByOrderId(order.getId()).orElse(null);
        String status=payment==null ? "UNKNOWN" : "SUCCESS".equals(payment.getStatus()) ? "LEGACY_UNVERIFIED" : payment.getStatus();
        OrderResponse r=OrderResponse.fromEntity(order,payment==null ? "UNKNOWN" : payment.getPaymentMethod(),status);
        OrderReturn ret=order.getId()==null ? null : returns.findByOrderId(order.getId()).orElse(null);
        r.setReturnStatus(ret==null ? null : ret.getStatus());
        r.setReturnable("DELIVERED".equals(order.getStatus()) && ret==null
            && (order.getDeliveredAt()==null || !order.getDeliveredAt().plusDays(RETURN_WINDOW_DAYS).isBefore(LocalDateTime.now())));
        return r;
    }
}
