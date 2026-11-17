import type { Schema, Struct } from '@strapi/strapi';

export interface SharedExpertise extends Struct.ComponentSchema {
  collectionName: 'components_shared_expertises';
  info: {
    displayName: 'Expertise';
    icon: 'star';
  };
  attributes: {
    description: Schema.Attribute.Text;
    name: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSkill extends Struct.ComponentSchema {
  collectionName: 'components_shared_skills';
  info: {
    displayName: 'Skill';
    icon: 'asterisk';
  };
  attributes: {
    level: Schema.Attribute.Enumeration<
      ['beginner', 'intermediate', 'advanced', 'expert']
    > &
      Schema.Attribute.DefaultTo<'beginner'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSocialLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_social_links';
  info: {
    displayName: 'Social Link';
    icon: 'link';
  };
  attributes: {
    platform: Schema.Attribute.Enumeration<
      ['linkedin', 'twitter', 'github', 'instagram', 'facebook', 'website']
    > &
      Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'shared.expertise': SharedExpertise;
      'shared.skill': SharedSkill;
      'shared.social-link': SharedSocialLink;
    }
  }
}
