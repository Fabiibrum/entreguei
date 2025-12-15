export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  COURIER = 'COURIER'
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED', // Entregador aceitou, indo para coleta
  PICKED_UP = 'PICKED_UP', // Fez check-in na coleta, indo para entrega
  ARRIVED_DESTINATION = 'ARRIVED_DESTINATION', // Fez check-in na entrega, cobrando/finalizando
  DELIVERED = 'DELIVERED' // Finalizado
}

export enum ImageSize {
  S1K = '1K',
  S2K = '2K',
  S4K = '4K'
}

export type PaymentMethod = 'PIX' | 'CASH';
export type PayerType = 'SENDER' | 'RECIPIENT';

export interface DeliveryRequest {
  id: string;
  itemDescription: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: DeliveryStatus;
  createdAt: number;
  imageUrl?: string;
  courierId?: string;
  // New fields
  recipientName: string;
  recipientPhone: string;
  paymentMethod: PaymentMethod;
  payer: PayerType; // Quem paga: Remetente ou Destinatário
  
  // Coordinates for Map
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}