import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Filter, Target, Star } from 'lucide-react';

const GuestSegments = () => {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Segmentierung in Entwicklung</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Gäste-Segmentierung nach Verhalten, Umsatz und 
          Präferenzen wird vorbereitet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VIP Gäste</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Premium Gäste-Segment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stammgäste</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Wiederkehrende Gäste
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Neue Gäste</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Erstkunden-Segment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custom Filter</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Individuelle Segmente
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestSegments;