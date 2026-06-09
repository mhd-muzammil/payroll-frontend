import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-6 bg-background">
          <div className="max-w-md text-center space-y-4 p-8 border rounded-xl shadow-sm bg-card">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              An unexpected application error occurred. Our team has been notified.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <Button onClick={() => window.location.reload()} variant="default">
                Reload Application
              </Button>
              <Button onClick={() => window.location.href = '/'} variant="outline">
                Return Home
              </Button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-6 text-left border-t pt-4">
                <p className="text-xs font-mono text-destructive break-all">{this.state.error?.toString()}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
