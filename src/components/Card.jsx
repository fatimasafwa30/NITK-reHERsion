import { Link } from 'react-router-dom';
import styles from './Card.module.css';

/** Pass `to` for an internal-link card; otherwise renders as the given `as` element (default div). */
export default function Card({ className = '', children, as: As = 'div', to, ...rest }) {
  const classes = `${styles.card} ${className}`;
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <As className={classes} {...rest}>
      {children}
    </As>
  );
}
