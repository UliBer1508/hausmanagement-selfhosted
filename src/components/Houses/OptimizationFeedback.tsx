import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, ThumbsUp, ThumbsDown, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface OptimizationFeedbackProps {
  houseId: string;
  optimizationId?: string;
  onFeedbackSubmitted?: () => void;
}

export const OptimizationFeedback: React.FC<OptimizationFeedbackProps> = ({
  houseId,
  optimizationId,
  onFeedbackSubmitted
}) => {
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [rating, setRating] = useState<number>(3);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedbackType) {
      toast.error("Bitte wählen Sie eine Feedback-Option");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('optimization_feedback')
        .insert({
          house_id: houseId,
          optimization_result_id: optimizationId,
          feedback_type: feedbackType,
          rating: rating,
          comments: comments || null,
          created_by: 'User'
        });

      if (error) throw error;

      toast.success("Vielen Dank für Ihr Feedback!");
      
      // Reset form
      setFeedbackType('');
      setRating(3);
      setComments('');

      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }

    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error("Fehler beim Senden des Feedbacks");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          KI-Optimierung bewerten
        </CardTitle>
        <CardDescription>
          Ihr Feedback hilft, die KI-Vorhersagen zu verbessern
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feedback Type */}
        <div className="space-y-3">
          <Label>Wie genau war die Vorhersage?</Label>
          <RadioGroup value={feedbackType} onValueChange={setFeedbackType}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="accurate" id="accurate" />
              <Label htmlFor="accurate" className="flex items-center gap-2 cursor-pointer">
                <ThumbsUp className="h-4 w-4 text-green-500" />
                Sehr genau - Empfehlungen waren passend
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="too_high" id="too_high" />
              <Label htmlFor="too_high" className="flex items-center gap-2 cursor-pointer">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                Zu hoch - Mehr Wäsche empfohlen als benötigt
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="too_low" id="too_low" />
              <Label htmlFor="too_low" className="flex items-center gap-2 cursor-pointer">
                <TrendingDown className="h-4 w-4 text-orange-500" />
                Zu niedrig - Mehr Wäsche benötigt als empfohlen
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="good" id="good" />
              <Label htmlFor="good" className="flex items-center gap-2 cursor-pointer">
                <ThumbsUp className="h-4 w-4 text-blue-500" />
                Gut - Kleinere Anpassungen nötig
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="bad" id="bad" />
              <Label htmlFor="bad" className="flex items-center gap-2 cursor-pointer">
                <ThumbsDown className="h-4 w-4 text-red-500" />
                Ungenau - Vorhersage war weit daneben
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Rating */}
        <div className="space-y-3">
          <Label>Gesamtbewertung</Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`text-2xl transition-colors ${
                  star <= rating ? 'text-yellow-500' : 'text-gray-300'
                }`}
              >
                ⭐
              </button>
            ))}
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-3">
          <Label htmlFor="comments">Zusätzliche Anmerkungen (optional)</Label>
          <Textarea
            id="comments"
            placeholder="Teilen Sie uns mit, was gut war oder verbessert werden könnte..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
          />
        </div>

        {/* Submit Button */}
        <Button 
          onClick={handleSubmit} 
          disabled={isSubmitting || !feedbackType}
          className="w-full"
        >
          {isSubmitting ? "Wird gesendet..." : "Feedback absenden"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Ihr Feedback wird verwendet, um die KI-Modelle kontinuierlich zu verbessern
        </p>
      </CardContent>
    </Card>
  );
};
