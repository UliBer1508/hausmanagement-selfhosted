import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VacancyAIAnalysis {
  bookingProbability: number;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  reasoning: string;
  actions: Array<{
    priority: number;
    action: string;
    reason: string;
  }>;
  urgency: 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
  deadline: string;
}

interface AnalyzeVacancyParams {
  vacancy: {
    start: string;
    end: string;
    days: number;
  };
  houseId: string;
}

export const useVacancyAI = () => {
  const queryClient = useQueryClient();

  const analyzeVacancyMutation = useMutation({
    mutationFn: async ({ vacancy, houseId }: AnalyzeVacancyParams) => {
      const { data, error } = await supabase.functions.invoke('analyze-vacancy', {
        body: { vacancy, houseId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Analysis failed');

      return data.analysis as VacancyAIAnalysis;
    },
    onSuccess: () => {
      toast.success('KI-Analyse abgeschlossen');
    },
    onError: (error: Error) => {
      console.error('Vacancy AI analysis error:', error);
      if (error.message.includes('Rate limit')) {
        toast.error('Zu viele Anfragen. Bitte versuche es später erneut.');
      } else if (error.message.includes('credits')) {
        toast.error('Nicht genügend Credits. Bitte Guthaben aufladen.');
      } else {
        toast.error('KI-Analyse fehlgeschlagen: ' + error.message);
      }
    },
  });

  return {
    analyzeVacancy: analyzeVacancyMutation.mutate,
    isAnalyzing: analyzeVacancyMutation.isPending,
    analysis: analyzeVacancyMutation.data,
    error: analyzeVacancyMutation.error,
  };
};
