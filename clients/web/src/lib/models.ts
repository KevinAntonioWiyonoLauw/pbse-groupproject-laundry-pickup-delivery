export type Order = {
  id: string;
  customerId: string;
  serviceType: string;
  weightKg: number;
  pickupAddress: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Pickup = {
  id: string;
  orderId: string;
  driverId: string;
  scheduledAt: string;
  address: string;
  status: string;
};

export type Cancellation = { status: string };
