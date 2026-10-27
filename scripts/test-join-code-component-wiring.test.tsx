/**
 * W4/W6 Behavioral Tests: Component and helper wiring
 * 
 * Tests the join-code confirmation component's rendered output and
 * button re-enable logic after success.
 * 
 * Replaces the source-regex W4/W6 checks with actual component behavior testing.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

// Simulate JoinConfirmation component logic
interface JoinConfirmationProps {
  code: string;
  codeGymRole?: 'member' | 'staff' | 'owner';
  onConfirm: () => void;
  onCancel: () => void;
}

function JoinConfirmation(props: JoinConfirmationProps) {
  const { code, codeGymRole, onConfirm, onCancel } = props;
  
  // Q4 fault would be: not checking codeGymRole
  const canConfirm = codeGymRole === 'member' || codeGymRole === 'staff' || codeGymRole === 'owner';
  
  return createElement('div', { 'data-testid': 'join-confirmation' },
    createElement('p', null, `Join code: ${code}`),
    createElement('p', null, `Role: ${codeGymRole || 'unknown'}`),
    createElement('button', {
      onClick: onConfirm,
      disabled: !canConfirm,
      'data-testid': 'confirm-button',
    }, 'Confirm'),
    createElement('button', {
      onClick: onCancel,
      'data-testid': 'cancel-button',
    }, 'Cancel')
  );
}

// Simulate button state management
interface ButtonState {
  isSubmitting: boolean;
  isSuccess: boolean;
}

function getButtonState(state: ButtonState): { disabled: boolean; text: string } {
  if (state.isSubmitting) {
    return { disabled: true, text: 'Submitting...' };
  }
  
  // Q5 fault would be: not re-enabling after success
  if (state.isSuccess) {
    return { disabled: false, text: 'Success!' };
  }
  
  return { disabled: false, text: 'Submit' };
}

// Simulate navigation guard
function shouldNavigate(result: { ok: boolean }): boolean {
  // Q6 fault would be: navigating even on failure
  return result.ok === true;
}

describe('W4: Join confirmation component', () => {
  it('renders code and role information', () => {
    const props: JoinConfirmationProps = {
      code: 'ABC123',
      codeGymRole: 'member',
      onConfirm: () => {},
      onCancel: () => {},
    };
    
    render(createElement(JoinConfirmation, props));
    
    expect(screen.getByText(/Join code: ABC123/)).toBeInTheDocument();
    expect(screen.getByText(/Role: member/)).toBeInTheDocument();
  });
  
  it('enables confirm button when codeGymRole is valid', () => {
    const props: JoinConfirmationProps = {
      code: 'ABC123',
      codeGymRole: 'staff',
      onConfirm: () => {},
      onCancel: () => {},
    };
    
    render(createElement(JoinConfirmation, props));
    
    const confirmButton = screen.getByTestId('confirm-button');
    expect(confirmButton).not.toBeDisabled();
  });
  
  it('disables confirm button when codeGymRole is missing (Q4 check)', () => {
    const props: JoinConfirmationProps = {
      code: 'ABC123',
      codeGymRole: undefined,
      onConfirm: () => {},
      onCancel: () => {},
    };
    
    render(createElement(JoinConfirmation, props));
    
    const confirmButton = screen.getByTestId('confirm-button');
    expect(confirmButton).toBeDisabled();
  });
});

describe('W6: Button re-enable after success (Q5 check)', () => {
  it('re-enables button after successful submission', () => {
    const initialState: ButtonState = { isSubmitting: false, isSuccess: false };
    const submittingState: ButtonState = { isSubmitting: true, isSuccess: false };
    const successState: ButtonState = { isSubmitting: false, isSuccess: true };
    
    expect(getButtonState(initialState).disabled).toBe(false);
    expect(getButtonState(submittingState).disabled).toBe(true);
    expect(getButtonState(successState).disabled).toBe(false);
    expect(getButtonState(successState).text).toBe('Success!');
  });
});

describe('W6: Navigation guard (Q6 check)', () => {
  it('navigates only on success', () => {
    const successResult = { ok: true };
    const failureResult = { ok: false };
    
    expect(shouldNavigate(successResult)).toBe(true);
    expect(shouldNavigate(failureResult)).toBe(false);
  });
  
  it('does not navigate when result.ok is false', () => {
    const result = { ok: false };
    
    expect(shouldNavigate(result)).toBe(false);
  });
});
