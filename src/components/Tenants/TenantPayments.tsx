import { useState } from "react";
import { useHouses } from "@/hooks/useHouses";
import { useTenantPayments } from "@/hooks/useTenantPayments";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Mail, CheckCircle2, AlertCircle, Euro, TrendingUp, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import CreatePaymentDialog from "./CreatePaymentDialog";
import EditPaymentDialog from "./EditPaymentDialog";
import { TenantPayment } from "@/types";

const TenantPayments = () => {
  const { data: houses } = useHouses();
  const [selectedHouseId, setSelectedHouseId] = useState<string>("all");
  const { data: payments } = useTenantPayments(selectedHouseId === "all" ? undefined : selectedHouseId);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<TenantPayment | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const longTermRentals = houses?.filter(h => h.rental_type === 'long_term') || [];

  const thisMonth = new Date();
  const monthlyPayments = payments?.filter(p => {
    const dueDate = new Date(p.due_date);
    return dueDate.getMonth() === thisMonth.getMonth() && dueDate.getFullYear() === thisMonth.getFullYear();
  }) || [];

  const expectedTotal = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);
  const receivedTotal = monthlyPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const overduePayments = payments?.filter(p => p.status === 'overdue') || [];

  const handleSendReminder = (payment: TenantPayment) => {
    const house = payment.houses;
    const tenantInfo = house?.tenant_info as any;
    const subject = `Zahlungserinnerung - ${house?.name}`;
    const body = `Sehr geehrte/r ${tenantInfo?.tenant_name},\n\nwir möchten Sie freundlich an die ausstehende Mietzahlung erinnern:\n\nObjekt: ${house?.name}\nBetrag: ${payment.amount.toLocaleString('de-DE')} €\nFällig am: ${format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: de })}\n\nMit freundlichen Grüßen`;
    
    window.location.href = `mailto:${tenantInfo?.tenant_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
              <p className="text-sm text-muted-foreground">Erwartet (Monat)</p>
              <p className="text-2xl font-bold">{expectedTotal.toLocaleString('de-DE')} €</p>
            </div>
            <Euro className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Erhalten (Monat)</p>
              <p className="text-2xl font-bold">{receivedTotal.toLocaleString('de-DE')} €</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Überfällig</p>
              <p className="text-2xl font-bold">{overduePayments.length}</p>
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
            {payments?.map(payment => (
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
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedPayment(payment); setIsEditDialogOpen(true); }}>
                      Bearbeiten
                    </Button>
                    {payment.status === 'overdue' && (
                      <Button variant="ghost" size="sm" onClick={() => handleSendReminder(payment)}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
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
    </div>
  );
};

export default TenantPayments;
