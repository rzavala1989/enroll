'use client';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';

export function ContactAdvisorButton({
  advisorName,
  advisorEmail,
}: {
  advisorName: string;
  advisorEmail: string;
}) {
  const toast = useToast();

  function handleContact() {
    const subject = encodeURIComponent('Advising appointment request');
    const body = encodeURIComponent(
      `Hi ${advisorName.split(' ')[0]},\n\nI would like to schedule an advising appointment.\n\nThank you`,
    );
    window.location.href = `mailto:${advisorEmail}?subject=${subject}&body=${body}`;
    toast.push({
      kind: 'info',
      title: 'Opening email client',
      detail: `Composing message to ${advisorName}`,
    });
  }

  return (
    <Button variant="ghost" onClick={handleContact} className="text-xs">
      Contact advisor
    </Button>
  );
}
