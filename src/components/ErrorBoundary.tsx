import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    // Clear all potentially corrupted storage
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <h1 className="text-xl font-bold">Une erreur est survenue</h1>
            <p className="text-muted-foreground text-sm">
              L'application n'a pas pu se charger correctement. Cliquez ci-dessous pour réinitialiser.
            </p>
            <Button onClick={this.handleReset} variant="destructive">
              Réinitialiser et recharger
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
