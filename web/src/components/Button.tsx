import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '../lib/cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'dark' | 'nav' | 'link' | 'on-danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  block?: boolean;
  /** Square icon button; requires an aria-label. */
  iconOnly?: boolean;
  children?: ReactNode;
  className?: string;
}

function classes({ variant = 'secondary', size = 'md', block, iconOnly, className }: CommonProps, loading?: boolean) {
  // v1 `nav` (asphalt sidebar) becomes the v2 `dark` variant (strip, scanner, tooltips).
  const v = variant === 'nav' ? 'dark' : variant;
  return cx('btn', `btn--${v}`, `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', loading && 'is-loading', className);
}

function Content({ icon: Icon, iconEnd: IconEnd, size = 'md', loading, children }: CommonProps & { loading?: boolean }) {
  const iconSize = size === 'lg' ? 20 : 16;
  return (
    <>
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon size={iconSize} aria-hidden="true" className="btn__icon" /> : null}
      {children !== undefined && children !== null && children !== false && <span className="btn__label">{children}</span>}
      {IconEnd && !loading && <IconEnd size={iconSize} aria-hidden="true" className="btn__icon" />}
    </>
  );
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant, size, icon, iconEnd, block, iconOnly, className, children, loading, type = 'button', onClick, ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes({ variant, size, block, iconOnly, className }, loading)}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      <Content icon={icon} iconEnd={iconEnd} size={size} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, Omit<LinkProps, 'children' | 'className'> {}

/** A router link styled as a button. */
export function ButtonLink({ variant, size, icon, iconEnd, block, iconOnly, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, block, iconOnly, className })} {...rest}>
      <Content icon={icon} iconEnd={iconEnd} size={size}>
        {children}
      </Content>
    </Link>
  );
}
