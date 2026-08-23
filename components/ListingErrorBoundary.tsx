import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ListingErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ListingErrorBoundary caught an error:', error, errorInfo);
    // Ideally log this to Sentry or internal logging API
  }

  public render() {
    if (this.state.hasError) {
      // Luxury Skeleton Fallback per v4.0 (Zero Placeholder text rule)
      return (
        <div className="min-h-screen bg-zinc-50 flex flex-col animate-pulse">
          {/* Skeleton Hero */}
          <div className="w-full h-[75vh] bg-zinc-200"></div>
          {/* Skeleton Body */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
            <div className="w-2/3 h-12 bg-zinc-200 rounded-lg mb-6"></div>
            <div className="w-1/4 h-6 bg-zinc-200 rounded-lg mb-12"></div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-8 space-y-6">
                <div className="w-full h-48 bg-zinc-200 rounded-2xl"></div>
                <div className="w-full h-48 bg-zinc-200 rounded-2xl"></div>
              </div>
              <div className="md:col-span-4">
                <div className="w-full h-72 bg-zinc-200 rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
