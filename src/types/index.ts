export interface Provider {
  id: string;
  name: string;
  service_type: 'cleaning' | 'laundry';
  email?: string;
  phone?: string;
  is_active?: boolean;
  has_portal?: boolean;
  avatar?: string;
}

export interface ServiceTask {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  scheduled_time?: string;
  scheduled_date?: string;
  provider_id?: string;
  house_id?: string;
  booking_id?: string;
  title: string;
  description?: string;
  progress?: number;
  items?: string[];
  houses?: House;
  bookings?: Booking;
}

export interface LinenItem {
  id: string;
  type: string;
  count: number;
  status: 'pending' | 'in-progress' | 'completed';
  icon?: string;
}

export interface LinenOrder {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'delivered';
  provider_id?: string;
  house_id?: string;
  booking_id?: string;
  order_date?: string;
  delivery_date?: string;
  items?: LinenItem[];
}

export interface Booking {
  id: string;
  check_in: string;
  check_out: string;
  guest_name?: string;
  guest_count?: number;
  house_id?: string;
  status?: 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
}

export interface House {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  max_guests?: number;
  bathrooms?: number;
  image_url?: string;
  description?: string;
}

export interface DashboardStats {
  totalHouses: number;
  activeBookings: number;
  pendingTasks: number;
  totalRevenue: number;
}