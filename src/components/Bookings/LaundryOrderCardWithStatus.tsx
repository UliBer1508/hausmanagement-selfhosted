import LaundryOrderCard from './LaundryOrderCard';
import { useExternalOrderStatus } from '@/hooks/useExternalOrderStatus';

type Props = React.ComponentProps<typeof LaundryOrderCard>;

/**
 * Wrapper around LaundryOrderCard that auto-fetches the current
 * processing status from the external Oberpinzgau portal when the
 * order has an external_bestellnummer.
 */
const LaundryOrderCardWithStatus = (props: Props) => {
  const bestellnummer = props.order?.external_bestellnummer ?? null;
  const { data } = useExternalOrderStatus(bestellnummer);
  return <LaundryOrderCard {...props} externalStatus={data ?? null} />;
};

export default LaundryOrderCardWithStatus;
