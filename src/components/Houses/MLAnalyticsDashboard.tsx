import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Target, Database, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface MLAnalyticsDashboardProps {
  houseId: string;
}

export const MLAnalyticsDashboard: React.FC<MLAnalyticsDashboardProps> = ({ houseId }) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [houseId]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Load prediction accuracy
      const { data: accuracyData } = await supabase
        .from('prediction_accuracy')
        .select('*')
        .eq('house_id', houseId)
        .order('prediction_date', { ascending: false })
        .limit(10);

      // Load usage history
      const { data: historyData } = await supabase
        .from('linen_usage_history')
        .select('*')
        .eq('house_id', houseId)
        .order('date', { ascending: false })
        .limit(30);

      // Load recent optimizations
      const { data: optimizationData } = await supabase
        .from('ai_optimization_results')
        .select('*')
        .eq('house_id', houseId)
        .order('analysis_date', { ascending: false })
        .limit(5);

      // Load feedback
      const { data: feedbackData } = await supabase
        .from('optimization_feedback')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: false })
        .limit(10);

      setAnalytics({
        accuracy: accuracyData || [],
        history: historyData || [],
        optimizations: optimizationData || [],
        feedback: feedbackData || []
      });

    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Fehler beim Laden der Analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-4">Lade Analytics...</div>;
  }

  const avgAccuracy = analytics?.accuracy.length > 0
    ? analytics.accuracy.reduce((sum: number, a: any) => sum + (a.accuracy_score || 0), 0) / analytics.accuracy.length
    : 0;

  const totalHistoricalSamples = analytics?.history.length || 0;

  const avgConfidence = analytics?.optimizations.length > 0
    ? analytics.optimizations.reduce((sum: number, o: any) => sum + (o.confidence_score || 0), 0) / analytics.optimizations.length
    : 0;

  const positiveFeedback = analytics?.feedback.filter((f: any) => 
    f.feedback_type === 'accurate' || f.feedback_type === 'good' || f.rating >= 4
  ).length || 0;

  const totalFeedback = analytics?.feedback.length || 0;
  const feedbackScore = totalFeedback > 0 ? (positiveFeedback / totalFeedback) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Vorhersage-Genauigkeit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgAccuracy * 100).toFixed(1)}%</div>
            <Progress value={avgAccuracy * 100} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Basierend auf {analytics?.accuracy.length} Messungen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Historische Daten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHistoricalSamples}</div>
            <p className="text-sm text-muted-foreground mt-2">Datenpunkte</p>
            <Badge variant={totalHistoricalSamples > 30 ? "default" : "secondary"} className="mt-2">
              {totalHistoricalSamples > 30 ? "Ausreichend" : "In Sammlung"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              KI-Konfidenz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgConfidence * 100).toFixed(0)}%</div>
            <Progress value={avgConfidence * 100} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Durchschnittliche Modell-Sicherheit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              User-Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{feedbackScore.toFixed(0)}%</div>
            <Progress value={feedbackScore} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {positiveFeedback} von {totalFeedback} positiv
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Accuracy */}
      <Card>
        <CardHeader>
          <CardTitle>Vorhersage-Genauigkeit (Letzte 10)</CardTitle>
          <CardDescription>
            Vergleich zwischen vorhergesagtem und tatsächlichem Verbrauch
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics?.accuracy.length > 0 ? (
            <div className="space-y-3">
              {analytics.accuracy.map((acc: any, idx: number) => (
                <div key={acc.id} className="flex items-center justify-between border-b pb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {new Date(acc.prediction_date).toLocaleDateString('de-DE')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MAE: {acc.mae?.toFixed(2)} | RMSE: {acc.rmse?.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={(acc.accuracy_score || 0) * 100} className="w-24" />
                    <span className="text-sm font-medium w-12">
                      {((acc.accuracy_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch keine Genauigkeitsdaten vorhanden. Daten werden nach abgeschlossenen Buchungen gesammelt.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Aktuelles Feedback</CardTitle>
          <CardDescription>
            Rückmeldungen zu KI-Optimierungsvorschlägen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics?.feedback.length > 0 ? (
            <div className="space-y-3">
              {analytics.feedback.slice(0, 5).map((fb: any) => (
                <div key={fb.id} className="flex items-start gap-3 border-b pb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        fb.feedback_type === 'accurate' || fb.feedback_type === 'good' ? 'default' : 'secondary'
                      }>
                        {fb.feedback_type}
                      </Badge>
                      {fb.rating && (
                        <span className="text-sm">⭐ {fb.rating}/5</span>
                      )}
                    </div>
                    {fb.comments && (
                      <p className="text-sm text-muted-foreground mt-1">{fb.comments}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(fb.created_at).toLocaleDateString('de-DE')} - {fb.created_by || 'System'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch kein Feedback vorhanden. Geben Sie Feedback zu KI-Vorschlägen, um das Modell zu verbessern.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Model Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Modell-Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className={`mt-1 ${totalHistoricalSamples > 50 ? 'text-green-500' : totalHistoricalSamples > 20 ? 'text-yellow-500' : 'text-orange-500'}`}>
              {totalHistoricalSamples > 50 ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">Datensammlung</p>
              <p className="text-xs text-muted-foreground">
                {totalHistoricalSamples > 50 
                  ? "Ausreichend Daten für zuverlässige Vorhersagen"
                  : totalHistoricalSamples > 20
                  ? "Gute Datenbasis, weitere Samples verbessern Genauigkeit"
                  : "Sammle mehr Daten für bessere Vorhersagen"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className={`mt-1 ${avgAccuracy > 0.8 ? 'text-green-500' : avgAccuracy > 0.6 ? 'text-yellow-500' : 'text-orange-500'}`}>
              {avgAccuracy > 0.8 ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">Modell-Performance</p>
              <p className="text-xs text-muted-foreground">
                {avgAccuracy > 0.8
                  ? "Modell liefert sehr genaue Vorhersagen"
                  : avgAccuracy > 0.6
                  ? "Modell-Performance ist akzeptabel, kann durch mehr Daten verbessert werden"
                  : "Modell benötigt mehr Training für bessere Genauigkeit"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className={`mt-1 ${feedbackScore > 80 ? 'text-green-500' : feedbackScore > 60 ? 'text-yellow-500' : 'text-orange-500'}`}>
              {feedbackScore > 80 ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">User-Zufriedenheit</p>
              <p className="text-xs text-muted-foreground">
                {feedbackScore > 80
                  ? "Sehr hohe Zufriedenheit mit KI-Empfehlungen"
                  : feedbackScore > 60
                  ? "Gute Akzeptanz, einige Optimierungen möglich"
                  : totalFeedback === 0
                  ? "Noch kein Feedback - bitte bewerten Sie KI-Vorschläge"
                  : "Feedback deutet auf Verbesserungsbedarf hin"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
