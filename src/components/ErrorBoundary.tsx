import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
            isFirestoreError = true;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <CardTitle>System Error</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-zinc-400 text-sm">
                {errorMessage}
              </p>
              {isFirestoreError && (
                <p className="text-[10px] font-mono text-zinc-600">
                  Please check your connection or permissions.
                </p>
              )}
              <Button 
                onClick={this.handleReset}
                className="w-full bg-white text-black hover:bg-zinc-200"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Restart Nexus OS
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
