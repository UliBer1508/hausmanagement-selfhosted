export interface GuestFilters {
  searchTerm?: string;
  statusFilter?: string;
  houseFilter?: string;
  categoryFilter?: string;
  sortBy?: 'booking' | 'name';
}

export interface BookingInfo {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  booking_amount: number | null;
  house_id: string;
  house_name: string;
}

export interface GuestWithBookings {
  // Direkt aus guests Tabelle
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  notes: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  birth_date: string | null;
  travel_document: string | null;
  created_at: string;
  updated_at: string;
  
  // Aggregierte Daten aus bookings
  bookings: BookingInfo[];
  total_revenue: number;
  last_booking: BookingInfo | null;
  next_booking: BookingInfo | null;
  stay_count: number;
  category: 'new' | 'returning';
  
  // Legacy-Kompatibilität für GuestList
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guest_notes: string | null;
}
