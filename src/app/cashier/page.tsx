import { redirect } from 'next/navigation';

export default function CashierIndex() {
  redirect('/cashier/scan');
}
