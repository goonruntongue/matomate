// Keeps a failing 3D extra (e.g. a character model that can't be downloaded while offline) from
// taking the whole game down: the extra is replaced by `fallback` and the game carries on.
import { Component, type ReactNode } from 'react';

export class SafeBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
