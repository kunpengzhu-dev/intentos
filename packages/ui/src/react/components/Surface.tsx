import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from 'react';
import { mercury } from '../../tokens/mercury.js';

type SurfaceVariant = 'panel' | 'soft' | 'pill';

type SurfaceProps<T extends ElementType = 'div'> = {
  as?: T;
  children?: ReactNode;
  className?: string;
  variant?: SurfaceVariant;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const variantClassName: Record<SurfaceVariant, string> = {
  panel: 'border backdrop-blur-[24px]',
  soft: 'border backdrop-blur-[18px]',
  pill: 'border backdrop-blur-[16px]',
};

const variantStyle: Record<SurfaceVariant, CSSProperties> = {
  panel: {
    background: mercury.surface.panel.background,
    borderColor: mercury.surface.panel.border,
    boxShadow: mercury.surface.panel.shadow,
    backdropFilter: `blur(${mercury.surface.panel.blur})`,
  },
  soft: {
    background: mercury.surface.soft.background,
    borderColor: mercury.surface.soft.border,
    boxShadow: mercury.surface.soft.shadow,
    backdropFilter: `blur(${mercury.surface.soft.blur})`,
  },
  pill: {
    background: mercury.surface.pill.background,
    borderColor: mercury.surface.pill.border,
    boxShadow: mercury.surface.pill.shadow,
    backdropFilter: `blur(${mercury.surface.pill.blur})`,
  },
};

export function Surface<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  variant = 'panel',
  style,
  ...props
}: SurfaceProps<T>) {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component className={`${variantClassName[variant]} ${className}`.trim()} style={{ ...variantStyle[variant], ...style }} {...props}>
      {children}
    </Component>
  );
}
