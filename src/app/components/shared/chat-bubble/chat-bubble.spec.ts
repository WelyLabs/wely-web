import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ChatBubbleComponent, ChatBubbleMessage } from './chat-bubble';
import { avatarColor } from '../../../core/ui/avatar';
import { AvatarService } from '../../../services/avatar.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

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
      providers: [provideRouter([]), { provide: AvatarService, useValue: { url: (id?: string | null) => signal(id === 'lea' ? '/pics/lea.jpg' : null) } }]
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

  it('template_shouldShowASystemNoticeAsAMutedLine_withoutAvatarNameNorTime', () => {
    const element = render({ text: '📅 Date fixée : jeudi 15 octobre, 19:00 – 21:00', time: '2026-10-12T19:05:00', isMe: false,
      senderName: 'Wely', senderId: 'system', system: true });

    expect(element.querySelector('.system-notice')?.textContent).toContain('Date fixée');
    expect(element.querySelector('.avatar')).toBeNull();
    expect(element.querySelector('.author')).toBeNull();
    expect(element.querySelector('.bubble')).toBeNull();
    expect(element.querySelector('.time')).toBeNull();
  });

  it('picture_shouldNotLookUpAnAvatar_forASystemNotice', () => {
    const avatars = TestBed.inject(AvatarService);
    const url = vi.spyOn(avatars, 'url');
    render({ text: 'Date fixée', time: '2026-10-12T19:05:00', isMe: false, senderId: 'system', system: true });

    expect(fixture.componentInstance.picture()).toBeNull();
    expect(url).not.toHaveBeenCalled();
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

  it('template_shouldShowAPlaceholder_whenAStoredPhotoHasNoUrl', () => {
    const element = render({ text: '', time: '2026-10-12T19:05:00', isMe: false, senderName: 'Léa', senderId: 'lea',
      photo: { url: null, width: 1600, height: 1200, removed: false } });
    let opened = false;
    fixture.componentInstance.photoOpened.subscribe(() => opened = true);

    const tile = element.querySelector('.photo.unavailable') as HTMLElement;
    expect(tile.textContent).toContain('Photo indisponible');
    expect(element.querySelector('.photo img')).toBeNull();
    expect(element.querySelector('button.photo')).toBeNull();
    tile.click();
    expect(opened).toBe(false);
  });

  it('template_shouldShowACommunityInvitationAsACard_withTheWordsBeforeTheLink', () => {
    const element = render({ text: "Je t'invite à rejoindre la communauté « Club » sur Wely (valable 3 jours) : "
        + 'http://localhost/communities/invite/AbCdEfGhIjKlMnOpQrSt', time: '2026-10-12T19:05:00', isMe: false,
      senderName: 'lea', senderId: 'lea' });

    expect(element.querySelector('.invitation-head')?.textContent).toContain('Invitation à une communauté');
    expect(element.querySelector('.invitation p')?.textContent).toBe("Je t'invite à rejoindre la communauté « Club » sur Wely (valable 3 jours)");
    expect(element.querySelector('.invitation-cta')?.getAttribute('href')).toBe('/communities/invite/AbCdEfGhIjKlMnOpQrSt');
    expect(element.textContent).not.toContain('http://localhost');
  });

  it('template_shouldShowABareInvitationLink_asACardWithoutWords', () => {
    const element = render({ text: '/communities/invite/AbCdEfGhIjKlMnOpQrSt', time: '2026-10-12T19:05:00', isMe: true });

    expect(element.querySelector('.invitation-cta')).toBeTruthy();
    expect(element.querySelector('.invitation p')).toBeNull();
    expect(fixture.componentInstance.invitation()?.intro).toBe('');
  });

  it('invitation_shouldBeNull_forAnOrdinaryMessage', () => {
    render({ text: 'On se voit samedi ?', time: '2026-10-12T19:05:00', isMe: true });

    expect(fixture.componentInstance.invitation()).toBeNull();
  });
});
