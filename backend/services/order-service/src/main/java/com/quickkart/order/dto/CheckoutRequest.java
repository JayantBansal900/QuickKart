package com.quickkart.order.dto;
import jakarta.validation.constraints.*;
public class CheckoutRequest {
    @NotBlank @Pattern(regexp="COD|UPI|CARD") private String paymentMethod;
    @NotBlank @Size(max=80) private String idempotencyKey;
    @NotBlank @Size(max=64) private String cartFingerprint;
    @NotBlank @Size(max=120) private String recipientName;
    @NotBlank @Size(min=8,max=1000) private String deliveryAddress;
    @NotBlank @Size(min=5,max=40) private String deliveryPhone;
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String value) { paymentMethod=value; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String value) { idempotencyKey=value; }
    public String getCartFingerprint() { return cartFingerprint; }
    public void setCartFingerprint(String value) { cartFingerprint=value; }
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String value) { recipientName=value; }
    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String value) { deliveryAddress=value; }
    public String getDeliveryPhone() { return deliveryPhone; }
    public void setDeliveryPhone(String value) { deliveryPhone=value; }

}
