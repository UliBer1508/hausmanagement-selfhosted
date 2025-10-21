import { z } from 'zod';

export const manualCompetitorSchema = z.object({
  property_name: z.string().min(3, "Mindestens 3 Zeichen erforderlich").max(200, "Maximal 200 Zeichen"),
  competitor_name: z.string().min(2, "Mindestens 2 Zeichen erforderlich").max(100, "Maximal 100 Zeichen"),
  platform: z.enum(['booking.com', 'airbnb', 'vrbo', 'fewo-direkt', 'other'], {
    required_error: "Bitte wählen Sie eine Plattform"
  }),
  property_url: z.string().url("Ungültige URL").optional().or(z.literal('')),
  address: z.string().max(300, "Maximal 300 Zeichen").optional().or(z.literal('')),
  distance_km: z.coerce.number().min(0, "Muss positiv sein").max(500, "Maximal 500 km").optional().or(z.literal('')),
  max_guests: z.coerce.number().int().min(1, "Mindestens 1 Gast").max(50, "Maximal 50 Gäste").optional().or(z.literal('')),
  bedrooms: z.coerce.number().int().min(0, "Muss positiv sein").max(20, "Maximal 20 Schlafzimmer").optional().or(z.literal('')),
  bathrooms: z.coerce.number().int().min(0, "Muss positiv sein").max(10, "Maximal 10 Badezimmer").optional().or(z.literal('')),
  rating: z.coerce.number().min(0, "Muss zwischen 0 und 10 sein").max(10, "Muss zwischen 0 und 10 sein").optional().or(z.literal('')),
  review_count: z.coerce.number().int().min(0, "Muss positiv sein").optional().or(z.literal('')),
  notes: z.string().max(1000, "Maximal 1000 Zeichen").optional().or(z.literal('')),
  amenities: z.array(z.string()).optional(),
  enable_scraping: z.boolean().default(false)
});

export type ManualCompetitorFormData = z.infer<typeof manualCompetitorSchema>;
