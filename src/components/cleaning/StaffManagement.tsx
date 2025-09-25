import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Plus, Star, Phone, Mail, MapPin, Clock } from 'lucide-react';
import { StaffDetailsDialog } from './StaffDetailsDialog';
import { CreateStaffDialog } from './CreateStaffDialog';

export const StaffManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [showStaffDetails, setShowStaffDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch cleaning staff
  const { data: staffList, isLoading, refetch } = useQuery({
    queryKey: ['cleaning-staff-management', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('cleaning_staff')
        .select('*')
        .order('name', { ascending: true });

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const handleStaffClick = (staff: any) => {
    setSelectedStaff(staff);
    setShowStaffDetails(true);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (isActive: boolean) => {
    return isActive ? 'Aktiv' : 'Inaktiv';
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-sm text-gray-600">({rating.toFixed(1)})</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-gray-200 rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Personal-Verwaltung</h2>
          <p className="text-sm text-gray-500">
            {staffList?.length || 0} Putzkräfte
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Putzkraft
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Suche nach Name, E-Mail oder Telefon..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-green-600 font-semibold">
                {staffList?.filter(s => s.is_active).length || 0}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Aktive Putzkräfte</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Verfügbar heute</p>
              <p className="text-xs text-gray-400">
                {staffList?.filter(s => s.is_active && s.availability_days?.includes(new Date().toLocaleDateString('de-DE', {weekday: 'long'}).toLowerCase())).length || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Staff List */}
      <div className="space-y-3">
        {staffList?.map((staff) => (
          <Card
            key={staff.id}
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleStaffClick(staff)}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-blue-100 text-blue-600">
                  {getInitials(staff.name)}
                </AvatarFallback>
              </Avatar>

              {/* Main Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {staff.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`${getStatusColor(staff.is_active)} border-0 text-xs`}>
                        {getStatusText(staff.is_active)}
                      </Badge>
                      {staff.quality_rating > 0 && renderStarRating(staff.quality_rating)}
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-1">
                  {staff.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{staff.email}</span>
                    </div>
                  )}
                  {staff.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-3 w-3" />
                      <span>{staff.phone}</span>
                    </div>
                  )}
                  {staff.address && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{staff.address}</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <div className="text-gray-600">
                    <span className="font-medium">{staff.completed_assignments || 0}</span>
                    <span className="text-gray-400"> / {staff.total_assignments || 0} Aufträge</span>
                  </div>
                  {staff.hourly_rate && (
                    <div className="text-gray-600">
                      <span className="font-medium">{staff.hourly_rate}€</span>
                      <span className="text-gray-400">/Std.</span>
                    </div>
                  )}
                </div>

                {/* Availability */}
                {staff.availability_days && staff.availability_days.length > 0 && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1">
                      {staff.availability_days.map((day: string) => (
                        <Badge key={day} variant="outline" className="text-xs">
                          {day.substring(0, 2).toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {staffList?.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-gray-500">
              {searchTerm ? 'Keine Putzkräfte gefunden' : 'Noch keine Putzkräfte hinzugefügt'}
            </p>
            {!searchTerm && (
              <Button 
                className="mt-4" 
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Erste Putzkraft hinzufügen
              </Button>
            )}
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <StaffDetailsDialog
        isOpen={showStaffDetails}
        onClose={() => setShowStaffDetails(false)}
        staff={selectedStaff}
        onUpdate={() => {
          refetch();
          setShowStaffDetails(false);
        }}
      />

      <CreateStaffDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => {
          refetch();
          setShowCreateDialog(false);
        }}
      />
    </div>
  );
};