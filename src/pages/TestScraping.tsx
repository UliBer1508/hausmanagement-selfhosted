import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const TestScraping = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const startScraping = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    toast({
      title: "Scraping gestartet",
      description: "Perplexity holt jetzt die Preise für alle Wettbewerber...",
    });

    try {
      console.log('Starting scrape-competitor-prices function...');
      
      const { data, error: functionError } = await supabase.functions.invoke('scrape-competitor-prices', {
        body: { 
          manual: true,
          year: new Date().getFullYear()
        }
      });

      if (functionError) {
        throw functionError;
      }

      console.log('Scraping results:', data);
      setResults(data);

      if (data.success) {
        toast({
          title: "✅ Scraping erfolgreich",
          description: `${data.total_months_scraped} Preise von ${data.total_properties} Wettbewerbern geladen`,
        });
      } else {
        toast({
          title: "⚠️ Scraping teilweise erfolgreich",
          description: `${data.total_months_failed} Fehler aufgetreten`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Scraping error:', err);
      setError(err.message || 'Unbekannter Fehler');
      
      toast({
        title: "❌ Scraping fehlgeschlagen",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-start beim Laden
  useEffect(() => {
    startScraping();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
            Perplexity Preis-Scraping Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={startScraping} 
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping läuft...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Erneut starten
                </>
              )}
            </Button>
            
            {isLoading && (
              <p className="text-sm text-muted-foreground">
                ⏳ Dies kann einige Minuten dauern...
              </p>
            )}
          </div>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Fehler</p>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {results && (
            <div className="space-y-4">
              <Card className={results.success ? 'border-green-500' : 'border-orange-500'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {results.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-orange-500" />
                    )}
                    Scraping Ergebnis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Jahr</p>
                      <p className="text-2xl font-bold">{results.year}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Wettbewerber</p>
                      <p className="text-2xl font-bold">{results.total_properties}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Preise geladen</p>
                      <p className="text-2xl font-bold text-green-600">
                        {results.total_months_scraped}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Fehler</p>
                      <p className="text-2xl font-bold text-red-600">
                        {results.total_months_failed}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {results.results && results.results.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Details pro Wettbewerber</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {results.results.map((result: any, index: number) => (
                        <div 
                          key={index}
                          className={`p-4 rounded-lg border ${
                            result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{result.property}</p>
                              <p className="text-sm text-muted-foreground">
                                {result.months_scraped}/12 Monate erfolgreich
                              </p>
                            </div>
                            {result.success ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                          </div>
                          {result.errors && result.errors.length > 0 && (
                            <div className="mt-2 text-sm text-red-600">
                              <p className="font-semibold">Fehler:</p>
                              <ul className="list-disc list-inside">
                                {result.errors.map((err: string, i: number) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TestScraping;
