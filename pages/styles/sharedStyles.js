import { StyleSheet } from 'react-native'
import colors from './colors'

export default StyleSheet.create({
  //  an individual menu item / option on the slide-up from the bottom menu
  actionSheetMenuItem: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  //  regular white text
  whiteText: {
    color: colors.WHITE,
    fontFamily: 'Roboto-Regular',
    fontSize: 14,
    fontWeight: '400',
  },
})
