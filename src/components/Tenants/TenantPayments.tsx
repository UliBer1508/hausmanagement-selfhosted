import { useState, useMemo } from "react";
import { useHouses } from "@/hooks/useHouses";
import { useTenantPayments, useDeletePayment, useUpdatePayment } from "@/hooks/useTenantPayments";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Mail, CheckCircle2, AlertCircle, Euro, TrendingUp, Paperclip, Trash2, Check } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import CreatePaymentDialog from "./CreatePaymentDialog";
import EditPaymentDialog from "./EditPaymentDialog";
import { TenantPayment } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TenantPayments = () => {
  const { data: houses } = useHouses();
  const [selectedHouseId, setSelectedHouseId] = useState<string>("all");
  const { data: payments } = useTenantPayments(selectedHouseId === "all" ? undefined : selectedHouseId);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<TenantPayment | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<TenantPayment | null>(null);
  const deletePayment = useDeletePayment();
  const updatePayment = useUpdatePayment();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");

  const longTermRentals = houses?.filter(h => h.rental_type === 'long_term') || [];

  const months = [
    { value: 0, label: "Januar" },
    { value: 1, label: "Februar" },
    { value: 2, label: "März" },
    { value: 3, label: "April" },
    { value: 4, label: "Mai" },
    { value: 5, label: "Juni" },
    { value: 6, label: "Juli" },
    { value: 7, label: "August" },
    { value: 8, label: "September" },
    { value: 9, label: "Oktober" },
    { value: 10, label: "November" },
    { value: 11, label: "Dezember" },
  ];

  // Generate available years (2020 to current year + 1)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2020; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years.reverse(); // Newest first
  }, [currentYear]);

  // Filter payments by selected year and month (cumulative)
  const filteredPayments = useMemo(() => {
    return payments?.filter(p => {
      const dueDate = new Date(p.due_date);
      const yearMatch = dueDate.getFullYear() === selectedYear;
      const monthMatch = selectedMonth === "all" 
        ? true 
        : dueDate.getMonth() <= selectedMonth; // Cumulative up to selected month
      return yearMatch && monthMatch;
    }) || [];
  }, [payments, selectedYear, selectedMonth]);

  // Calculate expected total from active rental contracts (cumulative)
  const expectedTotal = useMemo(() => {
    // Filter houses by selectedHouseId if not "all"
    const relevantHouses = selectedHouseId === "all" 
      ? longTermRentals 
      : longTermRentals.filter(h => h.id === selectedHouseId);
    
    // Determine last month to count (cumulative)
    const lastMonth = selectedMonth === "all" ? 11 : selectedMonth;
    
    let total = 0;
    
    relevantHouses.forEach(house => {
      const tenantInfo = house.tenant_info as any;
      if (!tenantInfo?.monthly_rent || !tenantInfo?.contract_start) return;
      
      const contractStart = new Date(tenantInfo.contract_start);
      const contractEnd = tenantInfo.contract_end ? new Date(tenantInfo.contract_end) : null;
      const monthlyTotal = (tenantInfo.monthly_rent || 0) + (tenantInfo.additional_costs || 0);
      
      // For each month from January to the selected month (cumulative)
      for (let month = 0; month <= lastMonth; month++) {
        const checkDate = new Date(selectedYear, month, 15); // Mid-month check
        
        // Contract must be active in this month
        if (checkDate < contractStart) continue;
        if (contractEnd && checkDate > contractEnd) continue;
        
        total += monthlyTotal;
      }
    });
    
    return total;
  }, [longTermRentals, selectedYear, selectedMonth, selectedHouseId]);

  // Calculate received total from paid payments
  const receivedTotal = useMemo(() => {
    return filteredPayments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPayments]);

  // Calculate outstanding amount
  const outstandingTotal = expectedTotal - receivedTotal;
  
  // Get overdue payments count
  const overduePayments = filteredPayments.filter(p => p.status === 'overdue');

  const handleSendReminder = (payment: TenantPayment) => {
    const house = payment.houses;
    const tenantInfo = house?.tenant_info as any;
    const subject = `Zahlungserinnerung - ${house?.name}`;
    const body = `Sehr geehrte/r ${tenantInfo?.tenant_name},\n\nwir möchten Sie freundlich an die ausstehende Mietzahlung erinnern:\n\nObjekt: ${house?.name}\nBetrag: ${payment.amount.toLocaleString('de-DE')} €\nFällig am: ${format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: de })}\n\nMit freundlichen Grüßen`;
    
    window.location.href = `mailto:${tenantInfo?.tenant_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleDeletePayment = (payment: TenantPayment) => {
    setPaymentToDelete(payment);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (paymentToDelete) {
      await deletePayment.mutateAsync(paymentToDelete.id);
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
    }
  };

  const handleMarkAsPaid = async (payment: TenantPayment) => {
    const today = new Date().toISOString().split('T')[0];
    await updatePayment.mutateAsync({
      id: payment.id,
      status: 'paid',
      payment_date: today
    });
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge variant="default" className="bg-green-600">Bezahlt</Badge>;
      case 'pending': return <Badge variant="secondary">Ausstehend</Badge>;
      case 'overdue': return <Badge variant="destructive">Überfällig</Badge>;
      case 'cancelled': return <Badge variant="outline">Storniert</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Erwartet ({selectedMonth === "all" ? selectedYear : `${months[selectedMonth].label} ${selectedYear}`})</p>
              <p className="text-2xl font-bold">{expectedTotal.toLocaleString('de-DE')} €</p>
            </div>
            <Euro className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Erhalten ({selectedMonth === "all" ? selectedYear : `${months[selectedMonth].label} ${selectedYear}`})</p>
              <p className="text-2xl font-bold">{receivedTotal.toLocaleString('de-DE')} €</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Offen ({selectedMonth === "all" ? selectedYear : `${months[selectedMonth].label} ${selectedYear}`})</p>
              <p className="text-2xl font-bold">{outstandingTotal.toLocaleString('de-DE')} €</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Zahlungsquote</p>
              <p className="text-2xl font-bold">
                {expectedTotal > 0 ? Math.round((receivedTotal / expectedTotal) * 100) : 0}%
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-600" />
          </div>
        </Card>
      </div>

      <div className="flex gap-4">
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Jahr" />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map(year => (
              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select 
          value={selectedMonth === "all" ? "all" : selectedMonth.toString()} 
          onValueChange={(v) => setSelectedMonth(v === "all" ? "all" : parseInt(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Monat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Monate</SelectItem>
            {months.map(m => (
              <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Objekt filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Objekte</SelectItem>
            {longTermRentals.map(house => (
              <SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Zahlung erfassen
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Objekt</TableHead>
              <TableHead>Mieter</TableHead>
              <TableHead>Fällig am</TableHead>
              <TableHead>Gezahlt am</TableHead>
              <TableHead>Betrag</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Beleg</TableHead>
              <TableHead>Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayments.map(payment => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.houses?.name}</TableCell>
                <TableCell>{(payment.houses?.tenant_info as any)?.tenant_name || '-'}</TableCell>
                <TableCell>{format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: de })}</TableCell>
                <TableCell>{payment.payment_date ? format(new Date(payment.payment_date), 'dd.MM.yyyy', { locale: de }) : '-'}</TableCell>
                <TableCell>{payment.amount.toLocaleString('de-DE')} €</TableCell>
                <TableCell>{getStatusBadge(payment.status)}</TableCell>
                <TableCell>
                  {payment.receipt_url && (
                    <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer">
                      <Paperclip className="h-4 w-4 text-primary" />
                    </a>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {(payment.status === 'pending' || payment.status === 'overdue') && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleMarkAsPaid(payment)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Als bezahlt markieren"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedPayment(payment); setIsEditDialogOpen(true); }}>
                      Bearbeiten
                    </Button>
                    {payment.status === 'overdue' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSendReminder(payment)}
                        title="Erinnerung senden"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDeletePayment(payment)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CreatePaymentDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      {selectedPayment && (
        <EditPaymentDialog payment={selectedPayment} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zahlung wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die Zahlung wird dauerhaft gelöscht.
              {paymentToDelete && (
                <div className="mt-4 p-4 bg-muted rounded-md">
                  <p><strong>Objekt:</strong> {paymentToDelete.houses?.name}</p>
                  <p><strong>Betrag:</strong> {paymentToDelete.amount.toLocaleString('de-DE')} €</p>
                  <p><strong>Fällig am:</strong> {format(new Date(paymentToDelete.due_date), 'dd.MM.yyyy', { locale: de })}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TenantPayments;
