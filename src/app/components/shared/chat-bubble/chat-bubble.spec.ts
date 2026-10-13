import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ChatBubbleComponent, ChatBubbleMessage } from './chat-bubble';
import { avatarColor } from '../../../core/ui/avatar';
import { AvatarService } from '../../../services/avatar.service';
import { signal } from '@angular/core';

describe('ChatBubbleComponent', () => {
  let fixture: ComponentFixture<ChatBubbleComponent>;

  const render = (message: ChatBubbleMessage): HTMLElement => {
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    // Lea has a picture; nobody else does.
    TestBed.configureTestingModule({
      imports: [ChatBubbleComponent],
      providers: [{ provide: AvatarService, useValue: { url: (id?: string | null) => signal(id === 'lea' ? '/pics/lea.jpg' : null) } }]
    });
    fixture = TestBed.createComponent(ChatBubbleComponent);
  });

  it('template_shouldSignSomeoneElsesMessageWithAvatarAndName', () => {
    const element = render({ text: 'Je ramène Dixit', time: '2026-10-12T19:05:00', isMe: false, senderName: 'Inès Bernard', senderId: 'ines' });

    expect(element.querySelector('.avatar')?.textContent?.trim()).toBe('IB');
    expect((element.querySelector('.avatar') as HTMLElement).style.background).toBeTruthy();
    expect(fixture.componentInstance.color()).toBe(avatarColor('ines'));
    expect(element.querySelector('.author')?.textContent).toBe('Inès Bernard');
    expect(element.querySelector('p')?.textContent).toBe('Je ramène Dixit');
    expect(element.querySelector('.time')?.textContent?.trim()).toBe('19:05');
  });

  it('template_shouldShowTheAuthorsPicture_whenTheyHaveOne', () => {
    const element = render({ text: 'Salut', time: '2026-10-12T19:05:00', isMe: false, senderName: 'Léa', senderId: 'lea' });

    expect(element.querySelector('img.avatar')?.getAttribute('src')).toBe('/pics/lea.jpg');
    expect(element.querySelector('span.avatar')).toBeNull();
  });

  it('template_shouldShowTheViewersOwnMessageWithoutAvatarNorName', () => {
    const element = render({ text: 'Top', time: '2026-10-12T19:05:00', isMe: true, senderName: 'Toi' });

    expect(element.querySelector('.row')?.classList).toContain('mine');
    expect(element.querySelector('.avatar')).toBeNull();
    expect(element.querySelector('.author')).toBeNull();
  });

  it('template_shouldMarkAMessageInFlightOrRefused', () => {
    expect(render({ text: 'a', time: '2026-10-12T19:05:00', isMe: true, pending: true }).querySelector('.row')?.classList)
      .toContain('pending');

    const failed = render({ text: 'a', time: '2026-10-12T19:05:00', isMe: true, failed: true });
    expect(failed.querySelector('.row')?.classList).toContain('failed');
    expect(failed.querySelector('.time')?.textContent?.trim()).toBe('Non envoyé');
  });

  it('color_shouldFallBackOnTheName_whenTheSenderIdIsMissing', () => {
    render({ text: 'a', time: '2026-10-12T19:05:00', isMe: false, senderName: 'leo' });

    expect(fixture.componentInstance.color()).toBe(avatarColor('leo'));
  });

  it('template_shouldShowAPhotoAtItsProportions_andReportATap', () => {
    const element = render({ text: '', time: '2026-10-12T19:05:00', isMe: false, senderName: 'Léa', senderId: 'lea',
      photo: { url: 'https://media/p.jpg', width: 1600, height: 1200, removed: false } });
    let opened = false;
    fixture.componentInstance.photoOpened.subscribe(() => opened = true);

    const button = element.querySelector('button.photo') as HTMLButtonElement;
    expect(button.style.aspectRatio).toBe('1600 / 1200');
    expect(button.querySelector('img')?.getAttribute('src')).toBe('https://media/p.jpg');
    expect(element.querySelector('p')).toBeNull();
    button.click();
    expect(opened).toBe(true);
  });

  it('template_shouldSayAPhotoWasRemoved', () => {
    const element = render({ text: '', time: '2026-10-12T19:05:00', isMe: true,
      photo: { url: null, width: 0, height: 0, removed: true } });

    expect(element.querySelector('button.photo')).toBeNull();
    expect(element.textContent).toContain('Photo retirée');
  });
});
