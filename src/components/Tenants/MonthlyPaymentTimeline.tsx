import { TenantPayment } from "@/types";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, isBefore, isAfter } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  payments: TenantPayment[];
  selectedYear: number;
}

const MonthlyPaymentTimeline = ({ payments, selectedYear }: Props) => {
  const today = new Date();
  
  // 12 Monate generieren
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const payment = payments.find(p => 
      new Date(p.due_date).getMonth() + 1 === month
    );
    
    let status: 'paid' | 'late' | 'overdue' | 'pending' | 'future' = 'future';
    let color = 'bg-muted';
    
    if (payment) {
      const dueDate = new Date(payment.due_date);
      const paymentDate = payment.payment_date ? new Date(payment.payment_date) : null;
      
      if (payment.status === 'paid') {
        // Pünktlich oder verspätet?
        if (paymentDate && isBefore(paymentDate, dueDate) || paymentDate && format(paymentDate, 'yyyy-MM-dd') === format(dueDate, 'yyyy-MM-dd')) {
          status = 'paid';
          color = 'bg-green-500';
        } else {
          status = 'late';
          color = 'bg-yellow-500';
        }
      } else if (payment.status === 'overdue') {
        status = 'overdue';
        color = 'bg-red-500';
      } else if (payment.status === 'pending' && isBefore(today, dueDate)) {
        status = 'pending';
        color = 'bg-muted-foreground/30';
      } else if (payment.status === 'pending' && isAfter(today, dueDate)) {
        status = 'overdue';
        color = 'bg-red-500';
      }
    } else {
      // Kein Payment gefunden - zukünftig?
      const firstDayOfMonth = new Date(selectedYear, i, 1);
      if (isBefore(today, firstDayOfMonth)) {
        status = 'future';
        color = 'bg-muted';
      }
    }
    
    return {
      month,
      monthName: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][i],
      payment,
      status,
      color
    };
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Zahlungs-Timeline {selectedYear}
      </p>
      
      <div className="flex gap-0.5 sm:gap-1">
        {months.map(({ month, monthName, payment, status, color }) => (
          <TooltipProvider key={month}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className={`flex-1 h-6 sm:h-8 rounded ${color} cursor-pointer hover:opacity-80 transition-opacity`}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm space-y-1">
                  <p className="font-semibold">{monthName} {selectedYear}</p>
                  {payment ? (
                    <>
                      <p>Fällig: {format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: de })}</p>
                      {payment.payment_date && (
                        <p>Bezahlt: {format(new Date(payment.payment_date), 'dd.MM.yyyy', { locale: de })}</p>
                      )}
                      <p>Betrag: {payment.amount.toLocaleString('de-DE')} €</p>
                      <p className="capitalize">
                        Status: {
                          status === 'paid' ? '✓ Pünktlich bezahlt' :
                          status === 'late' ? '⚠️ Verspätet bezahlt' :
                          status === 'overdue' ? '❌ Überfällig' :
                          status === 'pending' ? '⏳ Ausstehend' :
                          'Zukünftig'
                        }
                      </p>
                    </>
                  ) : (
                    <p>Keine Zahlung erfasst</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      
      {/* Legende */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-green-500" />
          Pünktlich
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-yellow-500" />
          Verspätet
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-red-500" />
          Überfällig
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-muted-foreground/30" />
          Ausstehend
        </div>
      </div>
    </div>
  );
};

export default MonthlyPaymentTimeline;
