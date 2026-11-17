package com.quickkart.order;
import com.quickkart.order.dto.*;
import com.quickkart.order.entity.*;
import com.quickkart.order.repository.*;
import com.quickkart.order.service.*;
import com.quickkart.order.security.JwtService;
import com.quickkart.order.exception.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc
class CommerceReliabilityIntegrationTest {
 @Autowired OrderService service; @Autowired CartService cartService;
 @Autowired UserRepository users; @Autowired ProductRepository products;
 @Autowired OrderRepository orders; @Autowired PaymentRepository payments;
 @Autowired JdbcTemplate jdbc; @Autowired MockMvc mvc; @Autowired JwtService jwt; @Autowired ObjectMapper json;
 User user; Product product;
 @BeforeEach void setup(){
  user=account();product=products.saveAndFlush(new Product("Snapshot title","Test only",new BigDecimal("12.50"),5,"Test"));
 }
 User account(){var u=new User("Customer",UUID.randomUUID()+"@example.invalid","unused","USER");u.setEmailVerified(true);u.setAccountStatus("ACTIVE");return users.saveAndFlush(u);}
 String token(User u){return jwt.generateToken(u.getEmail(),u.getRole(),u.getId());}
 CheckoutRequest request(User u){var r=new CheckoutRequest();r.setPaymentMethod("COD");r.setIdempotencyKey(UUID.randomUUID().toString());r.setCartFingerprint(cartService.getCart(u.getEmail()).getFingerprint());r.setRecipientName("Test Customer");r.setDeliveryAddress("123 Disposable Test Street");r.setDeliveryPhone("9876543210");return r;}
 void add(User u,int qty){cartService.addToCart(u.getEmail(),new AddCartItemRequest(product.getId(),qty));}
 int stock(){return products.findById(product.getId()).orElseThrow().getStockQuantity();}
 List<Object> race(Callable<?> first,Callable<?> second)throws Exception{
  var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
  try {var fs=new ArrayList<Future<Object>>();for(var task:List.of(first,second))fs.add(pool.submit(()->{start.await();try{return task.call();}catch(Exception e){return e;}}));start.countDown();return List.of(fs.get(0).get(30,TimeUnit.SECONDS),fs.get(1).get(30,TimeUnit.SECONDS));}finally{pool.shutdownNow();}
 }
 @Test void checkoutPersistsUnpaidCodSnapshotsAndDelivery() {
  add(user,2);var response=service.checkout(user.getEmail(),request(user));
  assertEquals("COLLECTION_PENDING",response.getPaymentStatus());assertEquals("COD",response.getPaymentMethod());
  assertEquals(new BigDecimal("25.00"),response.getTotalAmount());assertEquals(3,stock());assertTrue(cartService.getCart(user.getEmail()).getItems().isEmpty());
  product=products.findById(product.getId()).orElseThrow();product.setName("Renamed");product.setPrice(new BigDecimal("99.00"));products.saveAndFlush(product);
  var saved=service.getOrderById(user.getEmail(),response.getOrderId());assertEquals("Snapshot title",saved.getItems().get(0).getProductName());assertEquals(new BigDecimal("12.50"),saved.getItems().get(0).getPrice());assertEquals("123 Disposable Test Street",saved.getDeliveryAddress());assertTrue(saved.getCancellable());
 }
 @Test void retryReturnsOriginalAndConflictingPayloadRejected(){add(user,1);var r=request(user);var a=service.checkout(user.getEmail(),r);assertEquals(a.getOrderId(),service.checkout(user.getEmail(),r).getOrderId());assertEquals(4,stock());r.setDeliveryAddress("Different address");assertEquals(409,assertThrows(ResponseStatusException.class,()->service.checkout(user.getEmail(),r)).getStatusCode().value());assertEquals(1,service.getUserOrders(user.getEmail()).size());}
 @Test void priceChangeRequiresNewConfirmation(){add(user,1);var r=request(user);product.setPrice(new BigDecimal("15.00"));products.saveAndFlush(product);assertEquals(409,assertThrows(ResponseStatusException.class,()->service.checkout(user.getEmail(),r)).getStatusCode().value());assertEquals(5,stock());assertEquals(1,cartService.getCart(user.getEmail()).getItems().size());assertEquals(new BigDecimal("15.00"),service.checkout(user.getEmail(),request(user)).getTotalAmount());}
 @Test void insufficientStockLeavesCartAndOrderUntouched(){add(user,2);var r=request(user);product.setStockQuantity(1);products.saveAndFlush(product);assertThrows(InsufficientStockException.class,()->service.checkout(user.getEmail(),r));assertEquals(1,stock());assertTrue(service.getUserOrders(user.getEmail()).isEmpty());assertEquals(2,cartService.getCart(user.getEmail()).getItems().get(0).getQuantity());}
 @Test void finalUnitHasOneWinner()throws Exception{product.setStockQuantity(1);products.saveAndFlush(product);var other=account();add(user,1);add(other,1);var a=request(user);var b=request(other);var result=race(()->service.checkout(user.getEmail(),a),()->service.checkout(other.getEmail(),b));assertEquals(1,result.stream().filter(OrderResponse.class::isInstance).count(),result.toString());assertEquals(1,result.stream().filter(InsufficientStockException.class::isInstance).count(),result.toString());assertEquals(0,stock());}
 @Test void simultaneousIdenticalRequestsDeductOnce()throws Exception{add(user,1);var r=request(user);var result=race(()->service.checkout(user.getEmail(),r),()->service.checkout(user.getEmail(),r));assertTrue(result.stream().allMatch(OrderResponse.class::isInstance),result.toString());assertEquals(((OrderResponse)result.get(0)).getOrderId(),((OrderResponse)result.get(1)).getOrderId());assertEquals(4,stock());}
 @Test void simultaneousDifferentKeysCannotConsumeSameCartTwice()throws Exception{add(user,1);var a=request(user);var b=request(user);var result=race(()->service.checkout(user.getEmail(),a),()->service.checkout(user.getEmail(),b));assertEquals(1,result.stream().filter(OrderResponse.class::isInstance).count(),result.toString());assertEquals(1,result.stream().filter(EmptyCartException.class::isInstance).count(),result.toString());assertEquals(4,stock());}
 @Test void databaseFailureRollsBackOrderStockAndCart(){
  product.setPrice(new BigDecimal("314159.26"));products.saveAndFlush(product);add(user,1);var r=request(user);
  // The context factory owns the generated H2 database or Testcontainers instance.
  jdbc.execute("ALTER TABLE payments ADD CONSTRAINT phase4_forced_failure CHECK (amount <> 314159.26)");
  try{assertThrows(RuntimeException.class,()->service.checkout(user.getEmail(),r));}finally{jdbc.execute("ALTER TABLE payments DROP CONSTRAINT phase4_forced_failure");}
  assertEquals(5,stock());assertTrue(service.getUserOrders(user.getEmail()).isEmpty());assertEquals(1,cartService.getCart(user.getEmail()).getItems().size());assertEquals("COLLECTION_PENDING",service.checkout(user.getEmail(),r).getPaymentStatus());
 }
 @Test void repeatedConcurrentCancellationRestocksOnce()throws Exception{add(user,2);long id=service.checkout(user.getEmail(),request(user)).getOrderId();var result=race(()->service.cancelOrder(user.getEmail(),id),()->service.cancelOrder(user.getEmail(),id));assertTrue(result.stream().allMatch(OrderResponse.class::isInstance),result.toString());assertEquals(5,stock());var cancelled=service.getOrderById(user.getEmail(),id);assertEquals("CANCELLED",cancelled.getPaymentStatus());assertNotNull(cancelled.getCancelledAt());assertFalse(cancelled.getCancellable());}
 @Test void stateMachinePreventsSkippingRewindAndLateCancellation(){add(user,1);long id=service.checkout(user.getEmail(),request(user)).getOrderId();assertThrows(ResponseStatusException.class,()->service.updateOrderStatus(id,"DELIVERED"));service.updateOrderStatus(id,"CONFIRMED");service.updateOrderStatus(id,"PROCESSING");service.updateOrderStatus(id,"SHIPPED");assertThrows(ResponseStatusException.class,()->service.cancelOrder(user.getEmail(),id));assertThrows(ResponseStatusException.class,()->service.updateOrderStatus(id,"DELIVERED"));service.updateOrderStatus(id,"OUT_FOR_DELIVERY");service.updateOrderStatus(id,"DELIVERED");assertThrows(ResponseStatusException.class,()->service.updateOrderStatus(id,"PROCESSING"));assertEquals(4,stock());}
 @Test void concurrentCartAddsPreserveBothIncrements()throws Exception{var result=race(()->cartService.addToCart(user.getEmail(),new AddCartItemRequest(product.getId(),1)),()->cartService.addToCart(user.getEmail(),new AddCartItemRequest(product.getId(),1)));assertTrue(result.stream().allMatch(CartResponse.class::isInstance),result.toString());var c=cartService.getCart(user.getEmail());assertEquals(1,c.getItems().size());assertEquals(2,c.getItems().get(0).getQuantity());assertEquals(5,stock());}
 @Test void cartRejectsInvalidProductAndQuantity(){assertThrows(ProductNotFoundException.class,()->cartService.addToCart(user.getEmail(),new AddCartItemRequest(Long.MAX_VALUE,1)));assertThrows(IllegalArgumentException.class,()->cartService.addToCart(user.getEmail(),new AddCartItemRequest(product.getId(),-1)));assertTrue(cartService.getCart(user.getEmail()).getItems().isEmpty());}
 @Test void ownershipAdminBoundaryAndInvalidTokenEnforced()throws Exception{add(user,1);long id=service.checkout(user.getEmail(),request(user)).getOrderId();var other=account();mvc.perform(get("/api/orders/"+id).header("Authorization","Bearer "+token(other))).andExpect(status().isNotFound());mvc.perform(post("/api/orders/"+id+"/cancel").header("Authorization","Bearer "+token(other))).andExpect(status().isNotFound());mvc.perform(patch("/api/admin/orders/"+id+"/status").header("Authorization","Bearer "+token(user)).contentType("application/json").content("{\"status\":\"DELIVERED\"}")).andExpect(status().isForbidden());mvc.perform(post("/api/cart/items").header("Authorization","Bearer invalid").contentType("application/json").content("{\"productId\":1,\"quantity\":1}")).andExpect(status().isUnauthorized());assertEquals(4,stock());}
 @Test void issuedTokenRejectedAfterSuspension()throws Exception{add(user,1);var r=request(user);String token=token(user);user.setAccountStatus("SUSPENDED");users.saveAndFlush(user);mvc.perform(post("/api/orders/checkout").header("Authorization","Bearer "+token).contentType("application/json").content(json.writeValueAsString(r))).andExpect(status().isUnauthorized());assertEquals(5,stock());}
 @Test void checkoutApiValidatesDeliveryAndRejectsUnknownPaymentMethod()throws Exception{add(user,1);var r=request(user);r.setPaymentMethod("PAYPAL");mvc.perform(post("/api/orders/checkout").header("Authorization","Bearer "+token(user)).contentType("application/json").content(json.writeValueAsString(r))).andExpect(status().isBadRequest());r.setPaymentMethod("COD");r.setDeliveryAddress("");mvc.perform(post("/api/orders/checkout").header("Authorization","Bearer "+token(user)).contentType("application/json").content(json.writeValueAsString(r))).andExpect(status().isBadRequest());assertEquals(5,stock());}
 @Test void legacySuccessRequiresManualReview(){var legacy=orders.saveAndFlush(new Order(user,BigDecimal.TEN,"CONFIRMED",java.time.LocalDateTime.now()));payments.saveAndFlush(new Payment(legacy,BigDecimal.TEN,"SUCCESS","CARD","legacy-"+UUID.randomUUID(),java.time.LocalDateTime.now()));assertEquals("LEGACY_UNVERIFIED",service.getOrderById(user.getEmail(),legacy.getId()).getPaymentStatus());assertThrows(ResponseStatusException.class,()->service.cancelOrder(user.getEmail(),legacy.getId()));assertThrows(ResponseStatusException.class,()->service.updateOrderStatus(legacy.getId(),"PROCESSING"));assertEquals(5,stock());}
 @Test void explicitUnavailableFlagCannotBeBypassedByPositiveStock(){
  add(user,1);var r=request(user);product.setAvailability("OUT_OF_STOCK");products.saveAndFlush(product);
  assertThrows(InsufficientStockException.class,()->service.checkout(user.getEmail(),r));assertEquals(5,stock());assertTrue(service.getUserOrders(user.getEmail()).isEmpty());
 }

 @Test void deliveringCodOrderMarksPaymentCollected(){
  add(user,1);long id=service.checkout(user.getEmail(),request(user)).getOrderId();
  service.updateOrderStatus(id,"CONFIRMED");service.updateOrderStatus(id,"PROCESSING");service.updateOrderStatus(id,"SHIPPED");service.updateOrderStatus(id,"OUT_FOR_DELIVERY");
  assertEquals("COLLECTION_PENDING",payments.findByOrderId(id).orElseThrow().getStatus());
  var delivered=service.updateOrderStatus(id,"DELIVERED");
  assertEquals("COLLECTED",payments.findByOrderId(id).orElseThrow().getStatus());
  assertEquals("COLLECTED",delivered.getPaymentStatus());
 }

 // ---- simulated online payments ----
 CheckoutRequest online(User u,String method){var r=request(u);r.setPaymentMethod(method);return r;}
 @Test void onlineCheckoutWaitsForPaymentThenSuccessPlacesOrder(){
  add(user,2);var created=service.checkout(user.getEmail(),online(user,"UPI"));
  assertEquals("PENDING",created.getStatus());assertEquals("PENDING",created.getPaymentStatus());assertTrue(created.getPayable());assertEquals(3,stock());
  assertThrows(ResponseStatusException.class,()->service.updateOrderStatus(created.getOrderId(),"CONFIRMED"));
  var paid=service.pay(user.getEmail(),created.getOrderId(),true);
  assertEquals("PLACED",paid.getStatus());assertEquals("PAID",paid.getPaymentStatus());assertFalse(paid.getPayable());
  assertEquals("PLACED",service.pay(user.getEmail(),created.getOrderId(),true).getStatus()); // repeated callback is idempotent
  service.updateOrderStatus(created.getOrderId(),"CONFIRMED");
  var cancelled=service.cancelOrder(user.getEmail(),created.getOrderId());
  assertEquals("REFUNDED",cancelled.getPaymentStatus());assertEquals(5,stock());
 }
 @Test void failedPaymentCanBeRetriedAndOthersCannotPay(){
  add(user,1);long id=service.checkout(user.getEmail(),online(user,"CARD")).getOrderId();
  var failed=service.pay(user.getEmail(),id,false);
  assertEquals("PENDING",failed.getStatus());assertEquals("FAILED",failed.getPaymentStatus());assertTrue(failed.getPayable());
  assertThrows(OrderNotFoundException.class,()->service.pay(account().getEmail(),id,true));
  assertEquals("PLACED",service.pay(user.getEmail(),id,true).getStatus());
  assertEquals(2,jdbc.queryForObject("select count(*) from outbox_events where event_id like 'PAYMENT_%' and message_key=?",Integer.class,String.valueOf(id)));
 }
 @Test void codOrdersCannotBePaidOnline(){
  add(user,1);long id=service.checkout(user.getEmail(),request(user)).getOrderId();
  assertEquals(409,assertThrows(ResponseStatusException.class,()->service.pay(user.getEmail(),id,true)).getStatusCode().value());
 }
 @Test void unpaidOrderExpiresAndReturnsStock(){
  add(user,2);long id=service.checkout(user.getEmail(),online(user,"UPI")).getOrderId();assertEquals(3,stock());
  assertFalse(service.expireUnpaid(id,java.time.LocalDateTime.now().minusMinutes(30))); // not old enough yet
  assertTrue(service.expireUnpaid(id,java.time.LocalDateTime.now().plusSeconds(1)));
  var expired=service.getOrderById(user.getEmail(),id);
  assertEquals("CANCELLED",expired.getStatus());assertEquals("SYSTEM",expired.getCancelledBy());assertEquals("CANCELLED",expired.getPaymentStatus());assertEquals(5,stock());
  assertEquals(409,assertThrows(ResponseStatusException.class,()->service.pay(user.getEmail(),id,true)).getStatusCode().value());
 }
 @Test void payEndpointValidatesOutcome()throws Exception{
  add(user,1);long id=service.checkout(user.getEmail(),online(user,"UPI")).getOrderId();
  mvc.perform(post("/api/orders/"+id+"/pay").header("Authorization","Bearer "+token(user)).contentType("application/json").content("{\"outcome\":\"MAYBE\"}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/orders/"+id+"/pay").header("Authorization","Bearer "+token(user)).contentType("application/json").content("{\"outcome\":\"SUCCESS\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLACED"));
 }
 @Test void statusChangesAndStockMovementsAreRecorded(){
  add(user,2);long id=service.checkout(user.getEmail(),request(user)).getOrderId();
  service.updateOrderStatus(id,"CONFIRMED");service.cancelOrder(user.getEmail(),id);
  assertEquals(1,jdbc.queryForObject("select count(*) from outbox_events where event_id=?",Integer.class,"ORDER_STATUS-"+id+"-CONFIRMED"));
  assertEquals(1,jdbc.queryForObject("select count(*) from outbox_events where event_id=?",Integer.class,"ORDER_STATUS-"+id+"-CANCELLED"));
  var moves=jdbc.queryForList("select change_quantity, stock_after, reason from stock_movements where product_id=? order by id",product.getId());
  assertEquals(2,moves.size());
  assertEquals(-2,((Number)moves.get(0).get("CHANGE_QUANTITY")).intValue());assertEquals("ORDER_PLACED",moves.get(0).get("REASON"));
  assertEquals(2,((Number)moves.get(1).get("CHANGE_QUANTITY")).intValue());assertEquals(5,((Number)moves.get(1).get("STOCK_AFTER")).intValue());
 }
}
