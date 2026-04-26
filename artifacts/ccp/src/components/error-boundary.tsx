import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isTransientDomMismatchError(error: Error): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("removechild") ||
    msg.includes("insertbefore") ||
    msg.includes("the node to be removed is not a child") ||
    msg.includes("não é filho deste nó") ||
    msg.includes("nao e filho deste no")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  private autoRecoveryAttempted = false;
  private autoRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);

    if (isTransientDomMismatchError(error) && !this.autoRecoveryAttempted) {
      this.autoRecoveryAttempted = true;
      this.autoRecoveryTimer = setTimeout(() => {
        this.autoRecoveryTimer = null;
        this.setState({ hasError: false, error: null });
      }, 0);
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (prevState.hasError && !this.state.hasError) {
      this.autoRecoveryAttempted = false;
    }
  }

  componentWillUnmount() {
    if (this.autoRecoveryTimer !== null) {
      clearTimeout(this.autoRecoveryTimer);
      this.autoRecoveryTimer = null;
    }
  }

  handleReset = () => {
    this.autoRecoveryAttempted = false;
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div>
            <h2 className="text-xl font-semibold mb-1">Algo deu errado</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Ocorreu um erro inesperado nesta página. Tente recarregar.
            </p>
            {this.state.error && (
              <p className="text-xs text-destructive/70 mt-2 font-mono">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={this.handleReset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
