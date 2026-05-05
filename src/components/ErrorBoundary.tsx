import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  level?: "root" | "route";
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.level ?? "unknown"}]`,
      error,
      errorInfo
    );
    this.setState({ errorInfo });
  }

  private handleReload = () => window.location.reload();
  private handleHome = () => {
    window.location.href = "/";
  };
  private handleReset = () =>
    this.setState({ hasError: false, error: null, errorInfo: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const isDev = import.meta.env.DEV;
    const isRoot = this.props.level === "root";

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full rounded-lg border border-border bg-card p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              {isRoot ? "Anwendungsfehler" : "Diese Seite konnte nicht geladen werden"}
            </h1>
          </div>

          <p className="text-muted-foreground mb-6">
            Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche die Seite
            neu zu laden oder kehre zur Startseite zurück.
          </p>

          {isDev && this.state.error && (
            <details className="mb-6 text-sm">
              <summary className="cursor-pointer text-muted-foreground mb-2">
                Technische Details (nur Entwicklung)
              </summary>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48 text-foreground">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={this.handleReload} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Neu laden
            </Button>
            {!isRoot && (
              <Button variant="outline" onClick={this.handleReset} className="gap-2">
                Erneut versuchen
              </Button>
            )}
            <Button variant="outline" onClick={this.handleHome} className="gap-2">
              <Home className="h-4 w-4" />
              Zur Startseite
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
