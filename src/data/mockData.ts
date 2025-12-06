import { House, Booking, ServiceTask, LinenOrder, Provider, DashboardStats } from '@/types';

export const mockHouses: House[] = [
  {
    id: '1',
    name: 'Villa Sonnenschein',
    address: 'Meerstraße 15',
    city: 'Binz',
    postal_code: '18609',
    country: 'Deutschland',
    max_guests: 8,
    bathrooms: 3,
    image_url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=600&h=400&fit=crop',
    description: 'Luxuriöse Villa mit Meerblick'
  },
  {
    id: '2',
    name: 'Berghütte Alptraum',
    address: 'Bergweg 42',
    city: 'Garmisch-Partenkirchen',
    postal_code: '82467',
    country: 'Deutschland',
    max_guests: 6,
    bathrooms: 2,
    image_url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&h=400&fit=crop',
    description: 'Gemütliche Berghütte in den Alpen'
  },
  {
    id: '3',
    name: 'Seeblick Apartment',
    address: 'Seepromenade 8',
    city: 'Bodensee',
    postal_code: '88131',
    country: 'Deutschland',
    max_guests: 4,
    bathrooms: 1,
    image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop',
    description: 'Modernes Apartment am Bodensee'
  }
];

export const mockBookings: Booking[] = [
  {
    id: '1',
    house_id: '1',
    guest_name: 'Familie Müller',
    number_of_guests: 6,
    check_in: '2024-09-25',
    check_out: '2024-10-02',
    status: 'confirmed'
  },
  {
    id: '2',
    house_id: '2',
    guest_name: 'Max & Anna Weber',
    number_of_guests: 2,
    check_in: '2024-09-28',
    check_out: '2024-10-05',
    status: 'confirmed'
  },
  {
    id: '3',
    house_id: '3',
    guest_name: 'Thomas Schmidt',
    number_of_guests: 4,
    check_in: '2024-10-01',
    check_out: '2024-10-08',
    status: 'confirmed'
  }
];

export const mockProviders: Provider[] = [
  {
    id: '1',
    name: 'Amela Reinigungsservice',
    service_type: 'cleaning',
    email: 'amela@reinigung.de',
    phone: '+49 123 456789',
    is_active: true,
    has_portal: true,
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
  },
  {
    id: '2',
    name: 'Teuni Wäscheservice',
    service_type: 'laundry',
    email: 'teuni@waescherei.de',
    phone: '+49 987 654321',
    is_active: true,
    has_portal: true,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
  }
];

export const mockCleaningTasks: ServiceTask[] = [
  {
    id: '1',
    title: 'Badezimmer reinigen',
    status: 'scheduled',
    progress: 0,
    items: ['Dusche reinigen', 'WC putzen', 'Waschbecken säubern', 'Boden wischen'],
    house_id: '1',
    booking_id: '1',
    provider_id: '1',
    scheduled_date: '2024-09-24',
    scheduled_time: '10:00',
    service_type: 'cleaning'
  },
  {
    id: '2',
    title: 'Küche säubern',
    status: 'in_progress',
    progress: 60,
    items: ['Herd reinigen', 'Spüle putzen', 'Arbeitsflächen abwischen', 'Kühlschrank säubern'],
    house_id: '1',
    booking_id: '1',
    provider_id: '1',
    scheduled_date: '2024-09-24',
    scheduled_time: '11:30',
    service_type: 'cleaning'
  },
  {
    id: '3',
    title: 'Schlafzimmer',
    status: 'completed',
    progress: 100,
    items: ['Betten machen', 'Staubsaugen', 'Möbel abstauben'],
    house_id: '1',
    booking_id: '1',
    provider_id: '1',
    scheduled_date: '2024-09-24',
    scheduled_time: '09:00',
    service_type: 'cleaning'
  }
];

export const mockLinenOrders: LinenOrder[] = [
  {
    id: '1',
    status: 'pending',
    provider_id: '2',
    house_id: '1',
    booking_id: '1',
    order_date: '2024-09-23',
    delivery_date: '2024-09-24',
    items: [
      { id: '1', type: 'Bettwäsche', count: 4, status: 'pending' },
      { id: '2', type: 'Handtücher', count: 8, status: 'pending' },
      { id: '3', type: 'Geschirrtücher', count: 6, status: 'pending' }
    ]
  },
  {
    id: '2',
    status: 'in-progress',
    provider_id: '2',
    house_id: '2',
    booking_id: '2',
    order_date: '2024-09-22',
    delivery_date: '2024-09-25',
    items: [
      { id: '4', type: 'Bettwäsche', count: 3, status: 'in-progress' },
      { id: '5', type: 'Handtücher', count: 6, status: 'in-progress' }
    ]
  }
];

export const mockDashboardStats: DashboardStats = {
  totalHouses: 3,
  activeBookings: 3,
  pendingTasks: 5,
  totalRevenue: 12500
};