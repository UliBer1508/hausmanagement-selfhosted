import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { todayISO } from '@/lib/dateHelpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMarketingActions, MarketingAction } from '@/hooks/useMarketingActions';

const formSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed']),
  start_date: z.string().min(1, 'Startdatum ist erforderlich'),
  end_date: z.string().optional(),
  // Target criteria
  has_children: z.boolean().default(false),
  min_stays: z.number().min(0).optional(),
  nationality: z.string().optional(),
  min_nights: z.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAction?: MarketingAction | null;
}

const CreateActionDialog = ({ open, onOpenChange, editAction }: CreateActionDialogProps) => {
  const { createAction, updateAction } = useMarketingActions();
  const isEditing = !!editAction;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      status: 'active',
      start_date: todayISO(),
      end_date: '',
      has_children: false,
      min_stays: 0,
      nationality: '',
      min_nights: 0,
    },
  });

  useEffect(() => {
    if (editAction) {
      const criteria = editAction.target_criteria || {};
      form.reset({
        name: editAction.name,
        description: editAction.description || '',
        status: editAction.status,
        start_date: editAction.start_date,
        end_date: editAction.end_date || '',
        has_children: criteria.has_children || false,
        min_stays: criteria.min_stays || 0,
        nationality: criteria.nationality || '',
        min_nights: criteria.min_nights || 0,
      });
    } else {
      form.reset({
        name: '',
        description: '',
        status: 'active',
        start_date: todayISO(),
        end_date: '',
        has_children: false,
        min_stays: 0,
        nationality: '',
        min_nights: 0,
      });
    }
  }, [editAction, open, form]);

  const onSubmit = async (values: FormValues) => {
    const target_criteria: any = {};
    
    if (values.has_children) target_criteria.has_children = true;
    if (values.min_stays && values.min_stays > 0) target_criteria.min_stays = values.min_stays;
    if (values.nationality) target_criteria.nationality = values.nationality;
    if (values.min_nights && values.min_nights > 0) target_criteria.min_nights = values.min_nights;

    const actionData = {
      name: values.name,
      description: values.description || null,
      status: values.status,
      start_date: values.start_date,
      end_date: values.end_date || null,
      target_criteria,
    };

    if (isEditing && editAction) {
      await updateAction.mutateAsync({ id: editAction.id, ...actionData });
    } else {
      await createAction.mutateAsync(actionData);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Aktion bearbeiten' : 'Neue Marketing-Aktion'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Bearbeiten Sie die Details dieser Marketing-Aktion.'
              : 'Erstellen Sie eine neue Marketing-Aktion mit Zielgruppen-Kriterien.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Info */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name der Aktion *</FormLabel>
                  <FormControl>
                    <Input placeholder="z.B. Kindergeschenke" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Beschreiben Sie die Aktion..." 
                      className="resize-none"
                      rows={2}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Startdatum *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enddatum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Leer = unbegrenzt
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="paused">Pausiert</SelectItem>
                      <SelectItem value="completed">Beendet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Target Criteria */}
            <div className="space-y-3 pt-2 border-t">
              <h4 className="font-medium text-sm">Zielgruppen-Kriterien</h4>
              <p className="text-xs text-muted-foreground">
                Wählen Sie, welche Buchungen von dieser Aktion betroffen sind.
              </p>

              <FormField
                control={form.control}
                name="has_children"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        👨‍👩‍👧 Familien mit Kindern
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="min_stays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">
                      🔄 Stammgäste (min. Aufenthalte)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        placeholder="0 = alle"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="min_nights"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">
                      🌙 Mindestaufenthalt (Nächte)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        placeholder="0 = alle"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">
                      🌍 Nationalität
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="z.B. DE, AT, NL (leer = alle)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={createAction.isPending || updateAction.isPending}>
                {isEditing ? 'Speichern' : 'Erstellen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateActionDialog;
