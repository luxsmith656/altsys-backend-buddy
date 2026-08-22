import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <Card className="glass-card border-destructive/30 max-w-lg w-full rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <CardHeader className="p-0 space-y-2">
              <div className="h-14 w-14 rounded-2xl bg-destructive/15 text-destructive grid place-items-center mx-auto shadow-inner">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <CardTitle className="text-xl font-bold">
                {this.props.fallbackTitle || 'Something went wrong'}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {this.props.fallbackDescription ||
                  'An unexpected issue occurred while rendering this page. You can safely reload or return to the home screen.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 space-y-4">
              {this.state.error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-left text-xs font-mono text-destructive max-h-32 overflow-y-auto custom-scrollbar">
                  {this.state.error.toString()}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleGoHome}
                  className="text-xs gap-1.5 h-9 rounded-xl"
                >
                  <Home className="h-4 w-4" />
                  Return to Home
                </Button>
                <Button
                  size="sm"
                  onClick={this.handleReset}
                  className="text-xs gap-1.5 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
