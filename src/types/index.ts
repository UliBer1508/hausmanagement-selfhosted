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

// Note: Provider type kept for potential future API integrations

export interface ServiceTask {
  id: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'delayed';
  scheduled_time?: string;
  scheduled_date: string;
  provider_id?: string;
  house_id: string;
  booking_id?: string;
  service_type: 'cleaning' | 'laundry';
  assigned_staff_id?: string;
  notes?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  cleaning_hours?: number;
  cleaning_cost?: number;
  payment_status?: 'paid' | 'unpaid' | 'pending';
  // Legacy fields for compatibility
  title?: string;
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
  status: 'pending' | 'in-progress';
  icon?: string;
}

export interface LinenOrder {
  id: string;
  status: 'pending' | 'in-progress' | 'delivered' | 'cancelled';
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
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string;
  number_of_guests: number;
  house_id: string;
  status?: 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
  booking_amount?: number;
  currency?: string;
  external_booking_id?: string;
  external_id?: string;
  import_platform?: string;
  platform?: string;
  source?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  // Legacy field for compatibility
  guest_count?: number;
}

// Extended booking with joined house data (for overview queries)
export interface BookingWithHouse extends Omit<Booking, 'house_id'> {
  house_id?: string;
  houses?: {
    id: string;
    name: string;
    address?: string;
  };
}

export interface House {
  id: string;
  name: string;
  address: string;
  max_guests: number;
  bathrooms?: number;
  bedrooms?: number;
  living_area_sqm?: number;
  amenities?: {
    sauna?: boolean;
    terrace?: boolean;
    ski_cellar?: boolean;
    garage_spaces?: number;
    glacier_view?: boolean;
    additional_toilet?: boolean;
  };
  image_url?: string;
  image_filename?: string;
  ical_url?: string;
  linen_stock?: any;
  linen_dirty?: any;
  linen_in_cleaning?: any;
  linen_reserved?: any;
  linen_in_use?: any;
  ordered_linen?: any;
  default_cleaning_hours?: number;
  created_at?: string;
  updated_at?: string;
  // Legacy fields for compatibility
  city?: string;
  postal_code?: string;
  country?: string;
  description?: string;
}

export interface DashboardStats {
  totalHouses: number;
  activeBookings: number;
  pendingTasks: number;
  totalRevenue: number;
}