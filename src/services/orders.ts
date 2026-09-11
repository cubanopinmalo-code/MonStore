import { mockApiTransactions, mockOrders } from "@/data/mock/orders";
import type { ApiTransaction, Order } from "@/types";

const CURRENT_USER = "us_001";

export function getOrders(): Promise<Order[]> {
  return Promise.resolve(mockOrders.filter((order) => order.user_id === CURRENT_USER));
}

export function getAllOrders(): Promise<Order[]> {
  return Promise.resolve(mockOrders);
}

export function getOrderById(id: string): Promise<Order | null> {
  return Promise.resolve(
    mockOrders.find((order) => order.id === id || order.code === id) ?? null,
  );
}

export function getApiTransactions(orderId: string): Promise<ApiTransaction[]> {
  return Promise.resolve(mockApiTransactions.filter((tx) => tx.order_id === orderId));
}
