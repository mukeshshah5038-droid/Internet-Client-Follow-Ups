import { Timestamp } from 'firebase/firestore';

export type CustomerStatus = 'lead' | 'contacted' | 'appointment_scheduled' | 'won' | 'lost';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type FollowUpStatus = 'pending' | 'completed';

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  status: CustomerStatus;
  notes?: string;
  createdAt: Date | Timestamp;
  salesRepId: string;
}

export interface Appointment {
  id?: string;
  customerId: string;
  customerName?: string; // Denormalized for display
  dateTime: Date | Timestamp;
  location?: string;
  internetSpeed?: string;
  hasIPTV?: boolean;
  notes?: string;
  status: AppointmentStatus;
  updatedAt?: Date | Timestamp;
  lastReminderSent?: Date | Timestamp;
  salesRepId: string;
}

export interface FollowUp {
  id?: string;
  customerId: string;
  customerName?: string;
  appointmentId?: string;
  dueDateTime: Date | Timestamp;
  task: string;
  status: FollowUpStatus;
  salesRepId: string;
}
